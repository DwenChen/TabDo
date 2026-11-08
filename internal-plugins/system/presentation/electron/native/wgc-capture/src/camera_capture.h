#pragma once
#include "capture_timeline.h"
#include "mf_encoder.h"
#include <winrt/Windows.Devices.Enumeration.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Media.Capture.h>
#include <winrt/Windows.Media.Capture.Frames.h>
#include <winrt/Windows.Media.MediaProperties.h>
#include <winrt/Windows.Graphics.Imaging.h>
#include <winrt/Windows.Security.Cryptography.h>
#include <winrt/Windows.Storage.Streams.h>
#include <condition_variable>
#include <deque>
#include <thread>
#include <cwctype>
#include <iostream>
#include <chrono>

/** Camera frames and WGC frames use the same Windows SystemRelativeTime/QPC clock. */
class CameraCapture {
public:
    /**
     * Bind a camera writer to the owning session timeline and graphics device.
     * @param timeline Common capture clock owned by the recorder process.
     * @param device Session graphics device.
     * @param context Protected session graphics context.
     * @returns An inactive camera with no published frames.
     */
    CameraCapture(CaptureTimeline& timeline, ID3D11Device* device, ID3D11DeviceContext* context)
        : timeline_(timeline), device_(device), context_(context) {}

    /**
     * Release device callbacks, queued frames and the owned encoder.
     * @returns No value; repeated cleanup is safe.
     */
    ~CameraCapture() { try { stop(0); } catch (...) {} }

    /**
     * Prepare the selected real camera or the explicit E2E reference source without recording preparation.
     * @param outputPath Owned temporary camera MP4 path.
     * @param label Browser-selected friendly name; empty selects the default camera.
     * @param reference Test-only reference mode, authorized by the native process environment.
     * @param referenceWidth Width of the independent encoder's reference frames.
     * @param referenceHeight Height of the independent encoder's reference frames.
     * @returns Whether a real source frame and encoder are ready.
     */
    bool prepare(const std::wstring& outputPath, const std::wstring& label, bool reference, int referenceWidth, int referenceHeight) {
        reference_ = reference;
        if (reference_) {
            width_ = referenceWidth; height_ = referenceHeight;
            initialized_ = encoder_.initialize(outputPath, width_, height_, 60, device_, context_);
            encoder_.setTimelineOriginHns(0);
            return initialized_;
        }
        try {
            using namespace winrt::Windows::Media::Capture;
            using namespace winrt::Windows::Media::Capture::Frames;
            using namespace winrt::Windows::Devices::Enumeration;
            const auto devices = DeviceInformation::FindAllAsync(DeviceClass::VideoCapture).get();
            DeviceInformation selected{nullptr};
            for (const auto& candidate : devices) {
                const std::wstring name = candidate.Name().c_str();
                if ((label.empty() && !selected) || name == label || (!name.empty() && label.rfind(name, 0) == 0)) selected = candidate;
            }
            if (!selected) return false;
            MediaCaptureInitializationSettings settings;
            settings.VideoDeviceId(selected.Id());
            settings.StreamingCaptureMode(StreamingCaptureMode::Video);
            settings.MemoryPreference(MediaCaptureMemoryPreference::Cpu);
            settings.SharingMode(MediaCaptureSharingMode::SharedReadOnly);
            capture_ = MediaCapture();
            capture_.InitializeAsync(settings).get();
            MediaFrameSource source{nullptr};
            for (const auto& item : capture_.FrameSources()) if (item.Value().Info().SourceKind() == MediaFrameSourceKind::Color) { source = item.Value(); break; }
            if (!source) return false;
            const auto format = source.CurrentFormat().VideoFormat();
            width_ = static_cast<int>(format.Width()) & ~1; height_ = static_cast<int>(format.Height()) & ~1;
            initialized_ = encoder_.initialize(outputPath, width_, height_, 60, device_, context_);
            if (!initialized_) return false;
            encoder_.setTimelineOriginHns(0);
            reader_ = capture_.CreateFrameReaderAsync(source, winrt::Windows::Media::MediaProperties::MediaEncodingSubtypes::Bgra8()).get();
            reader_.AcquisitionMode(MediaFrameReaderAcquisitionMode::Realtime);
            token_ = reader_.FrameArrived([this](const MediaFrameReader& sender, const winrt::Windows::Foundation::IInspectable&) { receive(sender); });
            worker_ = std::thread([this]() { encodeFrames(); });
            if (reader_.StartAsync().get() != MediaFrameReaderStartStatus::Success) return false;
            std::unique_lock<std::mutex> lock(mutex_);
            return readyCv_.wait_for(lock, std::chrono::seconds(5), [this]() { return ready_ || failed_; }) && ready_ && !failed_;
        } catch (const winrt::hresult_error& error) {
            std::wcerr << L"ERROR: Camera preparation: " << error.message().c_str() << std::endl;
            return false;
        }
    }

    /**
     * Feed the explicit E2E camera source through its real independent encoder.
     * @param texture Owned WGC reference pixels; camera hardware is substituted only in this mode.
     * @param qpcHns Actual reference capture timestamp.
     * @returns Whether frame publication succeeds.
     */
    bool writeReference(ID3D11Texture2D* texture, int64_t qpcHns) {
        if (!reference_) return true;
        return write(texture, qpcHns);
    }

    /**
     * Drain only pre-stop frames and publish the same final output frame as the screen.
     * @param durationHns Common captured duration excluding pauses.
     * @returns Whether a non-empty camera file finalized successfully.
     */
    bool stop(int64_t durationHns) {
        if (stopped_) return !failed_;
        stopped_ = true;
        if (reader_) { try { reader_.FrameArrived(token_); reader_.StopAsync().get(); } catch (...) { failed_ = true; } reader_ = nullptr; }
        { std::lock_guard<std::mutex> lock(mutex_);
          const auto origin = timeline_.origin();
          if (durationHns > 0 && !seedQueued_ && prepared_ && origin) {
              prepared_->qpc = *origin; queue_.push_back(std::move(*prepared_)); prepared_.reset(); seedQueued_ = true;
          }
          closing_ = true; }
        cv_.notify_all();
        if (worker_.joinable()) worker_.join();
        if (capture_) { try { capture_.Close(); } catch (...) { failed_ = true; } capture_ = nullptr; }
        if (!initialized_) return !failed_;
        if (frames_ > 0 && durationHns > 0) {
            const int64_t count = std::max<int64_t>(1, (durationHns * 60 + 9999999) / 10000000);
            encoder_.extendLastFrameTo(count * 10000000LL / 60);
        }
        const bool finalized = encoder_.finalize();
        return finalized && !failed_ && (durationHns == 0 || frames_ > 0);
    }

private:
    struct Frame { winrt::com_array<uint8_t> pixels; int64_t qpc; int width; int height; };
    CaptureTimeline& timeline_;
    ID3D11Device* device_; ID3D11DeviceContext* context_;
    MFEncoder encoder_;
    winrt::Windows::Media::Capture::MediaCapture capture_{nullptr};
    winrt::Windows::Media::Capture::Frames::MediaFrameReader reader_{nullptr};
    winrt::event_token token_{};
    std::mutex mutex_; std::condition_variable cv_, readyCv_;
    std::deque<Frame> queue_; std::thread worker_;
    std::optional<Frame> prepared_;
    bool seedQueued_ = false;
    bool reference_ = false, initialized_ = false, ready_ = false, closing_ = false, stopped_ = false;
    std::atomic<bool> failed_{false};
    int width_ = 0, height_ = 0;
    int64_t lastFrame_ = -1, frames_ = 0;

    /**
     * Own a CPU bitmap and its sensor timestamp before releasing the WinRT frame.
     * @param sender Current camera frame reader.
     * @returns No value; bounded work is handed to the encoder thread.
     */
    void receive(const winrt::Windows::Media::Capture::Frames::MediaFrameReader& sender) {
        try {
            auto frame = sender.TryAcquireLatestFrame();
            if (!frame) return;
            const auto relative = frame.SystemRelativeTime();
            auto bitmap = frame.VideoMediaFrame().SoftwareBitmap();
            if (!relative || !bitmap) { frame.Close(); return; }
            const int64_t qpc = relative.Value().count();
            const auto origin = timeline_.origin();
            const bool active = timeline_.map(qpc).has_value();
            if (origin && qpc >= *origin && !active) { frame.Close(); return; }
            if (bitmap.BitmapPixelFormat() != winrt::Windows::Graphics::Imaging::BitmapPixelFormat::Bgra8) bitmap = winrt::Windows::Graphics::Imaging::SoftwareBitmap::Convert(bitmap, winrt::Windows::Graphics::Imaging::BitmapPixelFormat::Bgra8);
            const int width = bitmap.PixelWidth(), height = bitmap.PixelHeight();
            winrt::Windows::Storage::Streams::Buffer buffer(width * height * 4);
            buffer.Length(width * height * 4);
            bitmap.CopyToBuffer(buffer);
            winrt::com_array<uint8_t> pixels;
            winrt::Windows::Security::Cryptography::CryptographicBuffer::CopyToByteArray(buffer, pixels);
            if (pixels.size() != static_cast<size_t>(width) * height * 4) { failed_ = true; readyCv_.notify_all(); frame.Close(); return; }
            frame.Close();
            { std::lock_guard<std::mutex> lock(mutex_);
              ready_ = true;
              if (!active) { prepared_ = Frame{std::move(pixels), qpc, width, height}; readyCv_.notify_all(); return; }
              if (!seedQueued_ && prepared_ && origin) {
                  prepared_->qpc = *origin; queue_.push_back(std::move(*prepared_)); prepared_.reset(); seedQueued_ = true;
              }
              if (queue_.size() >= 16) { failed_ = true; return; }
              queue_.push_back({std::move(pixels), qpc, width, height}); }
            cv_.notify_one();
        } catch (...) { failed_ = true; readyCv_.notify_all(); }
    }

    /**
     * Encode sensor frames without blocking the frame reader or changing their clock.
     * @returns No value; all queued pre-stop frames are drained before exit.
     */
    void encodeFrames() {
        winrt::init_apartment(winrt::apartment_type::multi_threaded);
        while (true) {
            Frame frame;
            { std::unique_lock<std::mutex> lock(mutex_); cv_.wait(lock, [this]() { return closing_ || !queue_.empty(); });
              if (queue_.empty()) break;
              frame = std::move(queue_.front()); queue_.pop_front(); }
            D3D11_TEXTURE2D_DESC desc{};
            desc.Width = frame.width; desc.Height = frame.height; desc.MipLevels = 1; desc.ArraySize = 1;
            desc.Format = DXGI_FORMAT_B8G8R8A8_UNORM; desc.SampleDesc.Count = 1; desc.Usage = D3D11_USAGE_DEFAULT;
            D3D11_SUBRESOURCE_DATA data{}; data.pSysMem = frame.pixels.data(); data.SysMemPitch = frame.width * 4;
            Microsoft::WRL::ComPtr<ID3D11Texture2D> texture;
            if (FAILED(device_->CreateTexture2D(&desc, &data, &texture)) || !write(texture.Get(), frame.qpc)) failed_ = true;
        }
        winrt::uninit_apartment();
    }

    /**
     * Write a frame at its shared capture time and retain the source cadence.
     * @param texture Actual camera or test reference pixels.
     * @param qpcHns Source SystemRelativeTime in QPC units.
     * @returns Whether the selected output frame was encoded successfully.
     */
    bool write(ID3D11Texture2D* texture, int64_t qpcHns) {
        const auto elapsed = timeline_.map(qpcHns);
        if (!elapsed) return true;
        const int64_t index = *elapsed * 60 / 10000000LL;
        if (index <= lastFrame_) return true;
        if (!encoder_.writeFrame(texture, lastFrame_ < 0 ? 0 : index * 10000000LL / 60)) return false;
        lastFrame_ = index; ++frames_;
        return true;
    }
};
