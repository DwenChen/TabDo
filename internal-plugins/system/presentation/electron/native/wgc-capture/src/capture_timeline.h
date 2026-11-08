#pragma once
#include <windows.h>
#include <algorithm>
#include <cstdint>
#include <mutex>
#include <optional>
#include <vector>

/** Keep contiguous PCM packets on their sample clock instead of editing audio for QPC jitter. */
class CaptureAudioPacketClock {
public:
    /**
     * Correlate the device frame counter with one reliable QPC anchor per continuous span.
     * @param position Device frame position of the first sample.
     * @param frames Number of PCM frames in this packet.
     * @param rate Nominal sample rate; the capture format guarantees a positive value.
     * @param qpcHns Reported first-sample QPC, or the arrival estimate when unreliable.
     * @param reliable Whether the endpoint validates its position and timestamp.
     * @param discontinuity Whether the endpoint reports lost or reset capture data.
     * @returns First-sample QPC derived from sample continuity; true gaps use a new anchor.
     */
    int64_t map(uint64_t position, uint32_t frames, uint32_t rate, int64_t qpcHns,
                bool reliable, bool discontinuity) {
        // Timestamp errors must not turn packet arrival jitter into inserted or discarded PCM.
        if (!reliable) {
            const int64_t time = anchored_ ? endQpcHns_ : qpcHns;
            endQpcHns_ = time + static_cast<int64_t>(frames) * 10000000LL / rate;
            expectedPosition_ += frames;
            return time;
        }
        // A real device gap or reset establishes a new wall-clock correlation.
        if (!anchored_ || discontinuity || position != expectedPosition_) {
            originPosition_ = position;
            originQpcHns_ = qpcHns;
            anchored_ = true;
        }
        const int64_t time = originQpcHns_ + static_cast<int64_t>(
            static_cast<long double>(position - originPosition_) * 10000000.0L / rate);
        expectedPosition_ = position + frames;
        endQpcHns_ = time + static_cast<int64_t>(frames) * 10000000LL / rate;
        return time;
    }
private:
    bool anchored_ = false;
    uint64_t originPosition_ = 0, expectedPosition_ = 0;
    int64_t originQpcHns_ = 0, endQpcHns_ = 0;
};

/** One wall-clock calibration shared by video and packet capture, independent of IPC delivery. */
class CaptureTimeline {
public:
    struct Interval { int64_t start; int64_t end; };
    struct Slice { uint32_t offset; uint32_t count; uint64_t outputFrame; };

    /**
     * Calibrate precise Windows UTC against QPC once, before preparing capture.
     * @returns A timeline with no committed recording interval.
     */
    CaptureTimeline() {
        LARGE_INTEGER frequency, before, after;
        FILETIME time;
        QueryPerformanceFrequency(&frequency);
        QueryPerformanceCounter(&before);
        GetSystemTimePreciseAsFileTime(&time);
        QueryPerformanceCounter(&after);
        frequency_ = frequency.QuadPart;
        calibrationQpc_ = static_cast<int64_t>((static_cast<long double>(before.QuadPart + after.QuadPart) * 5000000.0L) / frequency_);
        ULARGE_INTEGER utc; utc.LowPart = time.dwLowDateTime; utc.HighPart = time.dwHighDateTime;
        calibrationUtc_ = static_cast<int64_t>(utc.QuadPart - 116444736000000000ULL);
    }

    /**
     * Convert a renderer's precise epoch milliseconds to the capture clock.
     * @param epochMs Agreed boundary, never the time a pipe message arrives.
     * @returns Boundary in QPC hundred-nanosecond units.
     */
    int64_t fromEpoch(double epochMs) const {
        return calibrationQpc_ + static_cast<int64_t>(epochMs * 10000.0 - calibrationUtc_);
    }

    /**
     * Report the precise native clock calibration used by captured frames and packets.
     * @param qpcHns QPC timestamp in hundred-nanosecond units.
     * @returns Corresponding epoch milliseconds.
     */
    double toEpoch(int64_t qpcHns) const { return static_cast<double>(calibrationUtc_ + qpcHns - calibrationQpc_) / 10000.0; }

    /**
     * Read the common first-frame boundary for a prepared camera snapshot.
     * @returns First committed QPC instant, or no value before commit.
     */
    std::optional<int64_t> origin() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return intervals_.empty() ? std::optional<int64_t>{} : intervals_.front().start;
    }

    /**
     * Read the currently active start/resume boundary for a static desktop snapshot.
     * @param qpcHns Current capture clock; future starts are not active yet.
     * @returns Start of the containing active interval, or no value during preparation/pause.
     */
    std::optional<int64_t> activeBoundary(int64_t qpcHns) const {
        std::lock_guard<std::mutex> lock(mutex_);
        for (auto interval = intervals_.rbegin(); interval != intervals_.rend(); ++interval) {
            if (qpcHns >= interval->start) return interval->end < 0 || qpcHns < interval->end ? std::optional<int64_t>{interval->start} : std::optional<int64_t>{};
        }
        return {};
    }

    /**
     * Open or close a common recording interval at the requested capture instant.
     * @param active Whether this boundary starts/resumes capture.
     * @param qpcHns Boundary in the native capture clock.
     * @returns No value; all streams observe the same immutable interval boundaries.
     */
    void boundary(bool active, int64_t qpcHns) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (active) {
            if (intervals_.empty() || intervals_.back().end >= 0) intervals_.push_back({qpcHns, -1});
        } else if (!intervals_.empty() && intervals_.back().end < 0) {
            intervals_.back().end = std::max(intervals_.back().start, qpcHns);
        }
    }

    /**
     * Map an actual captured frame to the shared timeline, excluding preparations and pauses.
     * @param qpcHns Actual WGC frame timestamp.
     * @returns Recorded time, or no timestamp outside the committed intervals.
     */
    std::optional<int64_t> map(int64_t qpcHns) const {
        std::lock_guard<std::mutex> lock(mutex_);
        int64_t elapsed = 0;
        for (const auto& interval : intervals_) {
            if (qpcHns < interval.start) return {};
            if (interval.end < 0 || qpcHns < interval.end) return elapsed + qpcHns - interval.start;
            elapsed += interval.end - interval.start;
        }
        return {};
    }

    /**
     * Select exact sample ranges from an audio packet on the common clock.
     * @param packetQpcHns Timestamp of its first captured sample.
     * @param frames Number of input PCM frames.
     * @param rate Audio sample rate.
     * @returns Active slices and their absolute destination sample positions.
     */
    std::vector<Slice> slices(int64_t packetQpcHns, uint32_t frames, uint32_t rate) const {
        std::lock_guard<std::mutex> lock(mutex_);
        std::vector<Slice> result;
        int64_t elapsed = 0;
        for (const auto& interval : intervals_) {
            const auto sampleAt = [&](int64_t time) { return static_cast<int64_t>((static_cast<long double>(time - packetQpcHns) * rate + 9999999.0L) / 10000000.0L); };
            const int64_t first = std::clamp<int64_t>(sampleAt(interval.start), 0, frames);
            const int64_t last = interval.end < 0 ? frames : std::clamp<int64_t>(sampleAt(interval.end), 0, frames);
            if (last > first) {
                const int64_t sourceTime = packetQpcHns + first * 10000000LL / rate;
                const uint64_t output = static_cast<uint64_t>(std::max<int64_t>(0, elapsed + sourceTime - interval.start)) * rate / 10000000LL;
                result.push_back({static_cast<uint32_t>(first), static_cast<uint32_t>(last - first), output});
            }
            if (interval.end < 0) break;
            elapsed += interval.end - interval.start;
        }
        return result;
    }

    /**
     * Read the committed elapsed time at a common boundary.
     * @param qpcHns Requested stop instant.
     * @returns Duration excluding pauses and initialization.
     */
    int64_t durationAt(int64_t qpcHns) const {
        std::lock_guard<std::mutex> lock(mutex_);
        int64_t elapsed = 0;
        for (const auto& interval : intervals_) elapsed += std::max<int64_t>(0, std::min(qpcHns, interval.end < 0 ? qpcHns : interval.end) - interval.start);
        return elapsed;
    }
private:
    int64_t frequency_ = 0, calibrationQpc_ = 0, calibrationUtc_ = 0;
    mutable std::mutex mutex_;
    std::vector<Interval> intervals_;
};
