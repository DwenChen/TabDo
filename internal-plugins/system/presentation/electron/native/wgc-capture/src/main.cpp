#include "wgc_session.h"
#include "mf_encoder.h"
#include "monitor_utils.h"
#include "wasapi_loopback.h"

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.System.h>

#include <iostream>
#include <string>
#include <thread>
#include <atomic>
#include <mutex>
#include <condition_variable>
#include <chrono>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <future>
#include <cstdlib>
#include <deque>
#include <d3d10.h>
#include "test_tone.h"
#include "camera_capture.h"
#include "capture_timeline.h"

static std::atomic<bool> g_stopRequested{false};
static std::atomic<bool> g_pauseRequested{false};
static std::atomic<int64_t> g_lastFrameTimestampHns{0};
static std::atomic<int64_t> g_pauseStartTimestampHns{0};
static std::atomic<int64_t> g_accumulatedPausedHns{0};
static std::mutex g_stopMutex;
static std::condition_variable g_stopCv;
static CaptureTimeline g_timeline;
static std::atomic<int64_t> g_stopBoundaryHns{-1};

static void reportMicrophoneCaptureUnavailable() {
    std::cerr << "WARNING: Failed to initialize WASAPI mic capture" << std::endl;
    // This stable stdout marker is ordered before "Recording started", allowing
    // Electron to select its per-recording browser fallback without a pipe race.
    std::cout << "MICROPHONE_CAPTURE_UNAVAILABLE" << std::endl;
    std::cout.flush();
}

struct CaptureConfig {
    int64_t displayId = 0;
    int64_t windowHandle = 0;
    std::string outputPath;
    std::string audioOutputPath;
    std::string micOutputPath;
    std::string micDeviceId;
    std::string micDeviceName;
    int fps = 60;
    int width = 0;
    int height = 0;
    int displayX = 0;
    int displayY = 0;
    int displayW = 0;
    int displayH = 0;
    bool hasDisplayBounds = false;
    bool captureSystemAudio = false;
    bool captureMic = false;
    bool deferStart = false;
    bool captureCamera = false;
    std::string cameraOutputPath;
    std::string cameraName;
};

static bool parseSimpleJson(const std::string& json, CaptureConfig& config) {
    auto findInt = [&](const std::string& key) -> int {
        auto pos = json.find("\"" + key + "\"");
        if (pos == std::string::npos) return -1;
        pos = json.find(':', pos);
        if (pos == std::string::npos) return -1;
        pos++;
        while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
        try {
            return std::stoi(json.substr(pos));
        } catch (...) {
            return -1;
        }
    };

    auto findInt64 = [&](const std::string& key) -> int64_t {
        auto pos = json.find("\"" + key + "\"");
        if (pos == std::string::npos) return -1;
        pos = json.find(':', pos);
        if (pos == std::string::npos) return -1;
        pos++;
        while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
        try {
            return std::stoll(json.substr(pos));
        } catch (...) {
            return -1;
        }
    };

    auto findString = [&](const std::string& key) -> std::string {
        auto pos = json.find("\"" + key + "\"");
        if (pos == std::string::npos) return "";
        pos = json.find(':', pos);
        if (pos == std::string::npos) return "";
        pos++;
        while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
        if (pos >= json.size() || json[pos] != '"') return "";
        pos++;
        std::string result;
        while (pos < json.size() && json[pos] != '"') {
            if (json[pos] == '\\' && pos + 1 < json.size()) {
                pos++;
                if (json[pos] == 'n') result += '\n';
                else if (json[pos] == 't') result += '\t';
                else if (json[pos] == '\\') result += '\\';
                else if (json[pos] == '"') result += '"';
                else if (json[pos] == '/') result += '/';
                else result += json[pos];
            } else {
                result += json[pos];
            }
            pos++;
        }
        return result;
    };

    config.outputPath = findString("outputPath");
    if (config.outputPath.empty()) return false;

    int64_t displayId = findInt64("displayId");
    if (displayId >= 0) config.displayId = displayId;

    int64_t windowHandle = findInt64("windowHandle");
    if (windowHandle > 0) config.windowHandle = windowHandle;

    int fps = findInt("fps");
    if (fps > 0) config.fps = fps;

    int width = findInt("width");
    if (width > 0) config.width = width;

    int height = findInt("height");
    if (height > 0) config.height = height;

    config.audioOutputPath = findString("audioOutputPath");
    config.micOutputPath = findString("micOutputPath");
    config.micDeviceId = findString("micDeviceId");
    config.micDeviceName = findString("micDeviceName");

    auto findBool = [&](const std::string& key) -> bool {
        auto pos = json.find("\"" + key + "\"");
        if (pos == std::string::npos) return false;
        auto colonPos = json.find(':', pos);
        if (colonPos == std::string::npos) return false;
        auto valStart = json.find_first_not_of(" \t", colonPos + 1);
        return valStart != std::string::npos && json.substr(valStart, 4) == "true";
    };

    config.captureSystemAudio = findBool("captureSystemAudio");
    config.captureMic = findBool("captureMic");
    config.deferStart = findBool("deferStart");
    config.captureCamera = findBool("captureCamera");
    config.cameraOutputPath = findString("cameraOutputPath");
    config.cameraName = findString("cameraName");

    int dx = findInt("displayX");
    int dy = findInt("displayY");
    int dw = findInt("displayW");
    int dh = findInt("displayH");
    if (dw > 0 && dh > 0) {
        config.displayX = dx;
        config.displayY = dy;
        config.displayW = dw;
        config.displayH = dh;
        config.hasDisplayBounds = true;
    }

    return true;
}

static std::wstring utf8ToWide(const std::string& str) {
    if (str.empty()) return L"";
    int len = MultiByteToWideChar(CP_UTF8, 0, str.c_str(), static_cast<int>(str.size()), nullptr, 0);
    std::wstring wstr(len, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, str.c_str(), static_cast<int>(str.size()), &wstr[0], len);
    return wstr;
}

static int64_t queryPerformanceCounterHns() {
    LARGE_INTEGER counter;
    LARGE_INTEGER frequency;
    if (!QueryPerformanceCounter(&counter) || !QueryPerformanceFrequency(&frequency) || frequency.QuadPart <= 0) {
        return g_lastFrameTimestampHns.load();
    }

    return static_cast<int64_t>(
        (static_cast<long double>(counter.QuadPart) * 10000000.0L) /
        static_cast<long double>(frequency.QuadPart));
}

static int64_t adjustedVideoTimestampHns(int64_t timestampHns) {
    int64_t accumulatedPausedHns = g_accumulatedPausedHns.load();
    if (g_pauseRequested.load()) {
        const int64_t pauseStart = g_pauseStartTimestampHns.load();
        if (pauseStart > 0 && timestampHns > pauseStart) {
            accumulatedPausedHns += (timestampHns - pauseStart);
        }
    }

    int64_t adjustedTimestampHns = timestampHns - accumulatedPausedHns;
    if (adjustedTimestampHns < 0) {
        adjustedTimestampHns = 0;
    }
    return adjustedTimestampHns;
}

static void openActivePauseAt(int64_t timestampHns) {
    g_pauseStartTimestampHns.store(timestampHns);
    g_pauseRequested.store(true);
}

static void closeActivePauseAt(int64_t timestampHns) {
    const int64_t pauseStart = g_pauseStartTimestampHns.exchange(0);
    if (pauseStart > 0 && timestampHns > pauseStart) {
        g_accumulatedPausedHns.fetch_add(timestampHns - pauseStart);
    }
    g_pauseRequested.store(false);
}

static void writeCompanionAudioTimingMetadata(
    const std::string& audioPath,
    int64_t firstVideoTimestampHns,
    const WasapiCapture& capture
) {
    if (audioPath.empty() || firstVideoTimestampHns < 0) {
        return;
    }

    const int64_t firstPacketQpcHns = capture.firstPacketQpcHns();
    if (firstPacketQpcHns < 0) {
        return;
    }

    // Shared packet slicing has already placed audio at its exact destination sample.
    const int64_t startDelayMs = 0;

    std::ofstream metadataFile(audioPath + ".json", std::ios::trunc);
    if (!metadataFile) {
        std::cerr << "WARNING: Failed to write audio timing metadata for " << audioPath << std::endl;
        return;
    }

    metadataFile << "{\"startDelayMs\":" << startDelayMs;
    metadataFile << ",\"capturedDurationMs\":" << capture.capturedDurationMs();
    metadataFile << ",\"dataBytes\":" << capture.totalDataBytes();
    metadataFile << ",\"sampleRate\":" << capture.sampleRate();
    metadataFile << ",\"channels\":" << capture.channelCount();
    metadataFile << ",\"gapFillCount\":" << capture.gapFillCount();
    metadataFile << ",\"insertedSilenceFrames\":" << capture.insertedSilenceFrames();
    metadataFile << ",\"compactedDiscontinuityCount\":" << capture.compactedDiscontinuityCount();
    metadataFile << ",\"compactedDiscontinuityFrames\":" << capture.compactedDiscontinuityFrames();
    metadataFile << ",\"compactedSilentDiscontinuityCount\":" << capture.compactedSilentDiscontinuityCount();
    metadataFile << ",\"compactedSilentDiscontinuityFrames\":" << capture.compactedSilentDiscontinuityFrames();
    const uint32_t discontinuityCount = capture.dataDiscontinuityCount();
    if (discontinuityCount > 0) {
        metadataFile << ",\"dataDiscontinuityCount\":" << discontinuityCount;
    }
    const uint32_t timestampErrorCount = capture.timestampErrorCount();
    if (timestampErrorCount > 0) {
        metadataFile << ",\"timestampErrorCount\":" << timestampErrorCount;
    }
    metadataFile << "}";
}

/**
 * Apply capture-clock boundaries sent before their scheduled instant.
 * @returns No value; EOF stops this owned session immediately.
 */
static void stdinListenerThread() {
    std::string line;
    while (std::getline(std::cin, line)) {
        // Trim whitespace
        while (!line.empty() && (line.back() == '\r' || line.back() == '\n' || line.back() == ' ')) {
            line.pop_back();
        }

        std::istringstream command(line);
        std::string action;
        double epochMs = 0;
        command >> action;
        const int64_t boundary = (command >> epochMs) ? g_timeline.fromEpoch(epochMs) : queryPerformanceCounterHns();
        if (action == "start" || action == "resume") {
            g_timeline.boundary(true, boundary);
            continue;
        }
        if (action == "pause") {
            g_timeline.boundary(false, boundary);
            continue;
        }
        if (action == "stop") {
            g_timeline.boundary(false, boundary);
            g_stopBoundaryHns = boundary;
            g_stopCv.notify_all();
            return;
        }
    }

    // stdin closed (parent process died)
    g_stopRequested = true;
    g_stopCv.notify_all();
}

/**
 * Prepare and run one owned cursor-free capture session.
 * @param argc Command argument count.
 * @param argv JSON configuration argument.
 * @returns Zero after successful publication, otherwise a nonzero capture failure.
 */
int main(int argc, char* argv[]) {
    const auto preparationStart = std::chrono::steady_clock::now();
    /**
     * Report preparation phases without changing the recording time origin.
     * @param phase Completed preparation phase.
     * @returns No value; diagnostics use elapsed steady-clock milliseconds.
     */
    const auto reportPreparation = [&](const char* phase) {
        std::cerr << "Capture preparation " << phase << " ms: " << std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - preparationStart).count() << std::endl;
    };
    if (argc == 2 && std::string(argv[1]) == "--test-clock") {
        CaptureTimeline clock;
        clock.boundary(true, 10000000); clock.boundary(false, 10500000);
        clock.boundary(true, 11000000); clock.boundary(false, 11900000);
        std::cout << "{\"durationMs\":" << clock.durationAt(11900000) / 10000.0 << ",\"frames\":[";
        const int64_t points[] = {9999999,10000000,10010000,10500000,11000000,11899999,11900000};
        bool first = true;
        for (const auto point : points) { if (!first) std::cout << ","; first = false; const auto time = clock.map(point); if (time) std::cout << std::setprecision(12) << *time / 10000.0; else std::cout << "null"; }
        std::cout << "],\"packets\":["; first = true;
        for (const auto packet : {std::pair<int64_t,uint32_t>{9900000,200}, {11880000,5}, {10400000,70}}) {
            if (!first) std::cout << ","; first = false; std::cout << "["; bool firstSlice = true;
            for (const auto& slice : clock.slices(packet.first, packet.second, 1000)) {
                if (!firstSlice) std::cout << ","; firstSlice = false;
                std::cout << "{\"offset\":" << slice.offset << ",\"count\":" << slice.count << ",\"outputFrame\":" << slice.outputFrame << "}";
            }
            std::cout << "]";
        }
        std::cout << "],\"audioPacketTimes\":[";
        CaptureAudioPacketClock audioClock;
        const int64_t packetTimes[] = {
            audioClock.map(0, 480, 48000, 10000000, true, false),
            audioClock.map(480, 480, 48000, 10105000, true, false),
            audioClock.map(960, 480, 48000, 10196000, true, false),
            audioClock.map(0, 480, 48000, 10350000, false, false),
            audioClock.map(1920, 480, 48000, 10403000, true, false),
            audioClock.map(2880, 480, 48000, 10610000, true, true),
            audioClock.map(3360, 480, 48000, 10713000, true, false),
            audioClock.map(0, 480, 48000, 10825000, true, true)
        };
        first = true;
        for (const auto time : packetTimes) { if (!first) std::cout << ","; first = false; std::cout << time; }
        std::cout << "]}" << std::endl;
        return 0;
    }
    if (argc == 2 && std::string(argv[1]) == "--test-tone-detector") {
        std::vector<float> samples(12000), background(6000), partial(7000);
        for (int i = 0; i < 12000; ++i) samples[i] = static_cast<float>(0.08 * std::sin(2 * 3.141592653589793 * 440 * i / 48000)) + captureDiagnosticToneSample(i - 4800, 48000);
        for (int i = 0; i < 6000; ++i) background[i] = static_cast<float>(0.35 * std::sin(2 * 3.141592653589793 * 880 * i / 48000));
        background[1500] = 1;
        for (int i = 2400; i < 3072; ++i) partial[i] = captureDiagnosticToneSample(i - 2400, 48000);
        const auto match = findCaptureDiagnosticTone(samples, 48000);
        std::cout << "{\"sample\":" << match.sample << ",\"correlation\":" << match.correlation << ",\"backgroundOnly\":" << (findCaptureDiagnosticTone(background, 48000).sample >= 0 ? "true" : "false") << ",\"partial\":" << (findCaptureDiagnosticTone(partial, 48000).sample >= 0 ? "true" : "false") << "}" << std::endl;
        return 0;
    }
    if (argc == 2 && std::string(argv[1]) == "--test-tone") {
        char testMode[8] = {};
        GetEnvironmentVariableA("TABDO_E2E", testMode, sizeof(testMode));
        if (std::string(testMode) != "1") return 1;
        const int64_t firstSample = playCaptureDiagnosticTone();
        if (firstSample < 0) return 1;
        std::cout << std::setprecision(17) << "{\"firstSampleEpochMs\":" << g_timeline.toEpoch(firstSample) << "}" << std::endl;
        return 0;
    }
    if (argc < 2) {
        std::cerr << "ERROR: Missing JSON config argument" << std::endl;
        return 1;
    }

    // Keep Win32 monitor/window rectangles in physical pixels. Without
    // per-monitor awareness, mixed-DPI desktops can report virtualized bounds
    // that do not line up with the WGC monitor texture.
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    winrt::init_apartment(winrt::apartment_type::multi_threaded);

    CaptureConfig config;
    if (!parseSimpleJson(argv[1], config)) {
        std::cerr << "ERROR: Failed to parse config JSON" << std::endl;
        return 1;
    }

    // Prepare independent audio endpoints concurrently with the graphics device and encoder.
    WasapiCapture loopback;
    WasapiCapture micCapture;
    loopback.setTimeline(&g_timeline);
    micCapture.setTimeline(&g_timeline);
    bool audioActive = false;
    bool audioInitialized = false;
    bool micActive = false;
    bool micInitialized = false;
    auto audioPreparation = std::async(std::launch::async, [&]() {
        CoInitializeEx(nullptr, COINIT_MULTITHREADED);
        if (config.captureSystemAudio && !config.audioOutputPath.empty()) {
            audioInitialized = loopback.initializeLoopback(config.audioOutputPath);
            if (!audioInitialized) std::cerr << "WARNING: Failed to initialize WASAPI loopback" << std::endl;
        }
        if (config.captureMic && !config.micOutputPath.empty()) {
            char testMode[8] = {}, testLoopback[8] = {};
            GetEnvironmentVariableA("TABDO_E2E", testMode, sizeof(testMode));
            GetEnvironmentVariableA("TABDO_E2E_CAPTURE_MIC_LOOPBACK", testLoopback, sizeof(testLoopback));
            micInitialized = std::string(testMode) == "1" && std::string(testLoopback) == "1"
                ? micCapture.initializeLoopback(config.micOutputPath)
                : micCapture.initializeMic(config.micOutputPath, config.micDeviceId, config.micDeviceName);
            if (!micInitialized) reportMicrophoneCaptureUnavailable();
        }
        CoUninitialize();
        reportPreparation("audio");
    });
    WgcSession session;

    if (config.windowHandle > 0) {
        HWND hwnd = reinterpret_cast<HWND>(static_cast<intptr_t>(config.windowHandle));
        if (!IsWindow(hwnd)) {
            std::cerr << "ERROR: Invalid window handle " << config.windowHandle << std::endl;
            return 1;
        }
        // Restore the target in-process; the prepared-frame handshake replaces shell activation delays.
        if (IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE);
        SetForegroundWindow(hwnd);
        if (!session.initialize(hwnd, config.fps)) {
            std::cerr << "ERROR: Failed to initialize WGC window capture session" << std::endl;
            return 1;
        }
    } else {
        HMONITOR monitor = nullptr;
        if (config.hasDisplayBounds) {
            std::cerr << "Monitor ID match failed, attempting coordinate-based match: "
                      << config.displayX << "," << config.displayY << " " << config.displayW << "x" << config.displayH << std::endl;
            monitor = findMonitorByBounds(config.displayX, config.displayY, config.displayW, config.displayH);
        }
        if (!monitor) monitor = findMonitorByDisplayId(config.displayId);

        if (!monitor) {
            std::cerr << "ERROR: Could not find monitor for displayId " << config.displayId << std::endl;
            return 1;
        }
        if (!session.initialize(monitor, config.fps)) {
            std::cerr << "ERROR: Failed to initialize WGC capture session" << std::endl;
            return 1;
        }
    }

    reportPreparation("graphics");
    int captureWidth = config.width > 0 ? config.width : session.captureWidth();
    int captureHeight = config.height > 0 ? config.height : session.captureHeight();

    // Ensure even dimensions for H.264
    captureWidth = (captureWidth / 2) * 2;
    captureHeight = (captureHeight / 2) * 2;
    Microsoft::WRL::ComPtr<ID3D10Multithread> graphicsGuard;
    if (SUCCEEDED(session.context()->QueryInterface(IID_PPV_ARGS(&graphicsGuard)))) graphicsGuard->SetMultithreadProtected(TRUE);

    std::unique_ptr<CameraCapture> camera;
    std::future<bool> cameraPreparation;
    if (config.captureCamera && !config.cameraOutputPath.empty()) {
        char testMode[8] = {}, referenceMode[8] = {};
        GetEnvironmentVariableA("TABDO_E2E", testMode, sizeof(testMode));
        GetEnvironmentVariableA("TABDO_E2E_NATIVE_CAMERA_REFERENCE", referenceMode, sizeof(referenceMode));
        const bool reference = std::string(testMode) == "1" && std::string(referenceMode) == "1";
        camera = std::make_unique<CameraCapture>(g_timeline, session.device(), session.context());
        cameraPreparation = std::async(std::launch::async, [&, reference]() {
            winrt::init_apartment(winrt::apartment_type::multi_threaded);
            const bool ready = camera->prepare(utf8ToWide(config.cameraOutputPath), utf8ToWide(config.cameraName), reference, captureWidth, captureHeight);
            reportPreparation("camera");
            winrt::uninit_apartment();
            return ready;
        });
    }
    // Initialize encoder
    MFEncoder encoder;
    std::wstring outputPathW = utf8ToWide(config.outputPath);
    if (!encoder.initialize(outputPathW, captureWidth, captureHeight, config.fps,
                           session.device(), session.context())) {
        std::cerr << "ERROR: Failed to initialize Media Foundation encoder" << std::endl;
        return 1;
    }

    reportPreparation("encoder");
    // Set up frame callback
    std::atomic<int64_t> frameCount{0};
    std::atomic<int64_t> firstVideoTimestampHns{-1};
    std::atomic<bool> recordingStartedAnnounced{false};
    std::atomic<bool> captureSetupComplete{false};
    std::atomic<bool> captureReadyAnnounced{false};
    struct PendingFrame { Microsoft::WRL::ComPtr<ID3D11Texture2D> texture; int64_t qpc; uint64_t bytes; };
    PendingFrame latestFrame;
    std::deque<PendingFrame> pendingFrames;
    std::mutex queueMutex;
    std::condition_variable queueCv;
    uint64_t queuedBytes = 0;
    bool queueClosed = false;
    std::atomic<bool> encodingFailed{false};
    int64_t lastOutputFrame = -1;
    encoder.setTimelineOriginHns(0);
    session.setFrameCallback([&](ID3D11Texture2D* texture, int64_t timestampHns) {
        g_lastFrameTimestampHns = timestampHns;
        if (g_stopRequested) return;
        const auto elapsed = g_timeline.map(timestampHns);
        // Copy the owned texture promptly: codec startup must not block WGC and lose the first frames.
        D3D11_TEXTURE2D_DESC desc;
        texture->GetDesc(&desc);
        desc.Usage = D3D11_USAGE_DEFAULT; desc.BindFlags = 0; desc.CPUAccessFlags = 0; desc.MiscFlags = 0;
        Microsoft::WRL::ComPtr<ID3D11Texture2D> copy;
        if (FAILED(session.device()->CreateTexture2D(&desc, nullptr, &copy))) { encodingFailed = true; g_stopRequested = true; return; }
        session.context()->CopyResource(copy.Get(), texture);
        const uint64_t bytes = static_cast<uint64_t>(desc.Width) * desc.Height * 4;
        {
            std::lock_guard<std::mutex> lock(queueMutex);
            // Retain one latest source snapshot: static windows need not emit a new frame after start/resume.
            latestFrame = {copy, timestampHns, bytes};
            if (!elapsed) { queueCv.notify_one(); return; }
            if (queuedBytes + bytes > 256ULL * 1024 * 1024 || pendingFrames.size() >= 60) {
                std::cerr << "ERROR: Capture encoder cannot keep up with timestamped frames" << std::endl;
                encodingFailed = true; g_stopRequested = true; return;
            }
            pendingFrames.push_back({copy, timestampHns, bytes});
            queuedBytes += bytes;
        }
        queueCv.notify_one();
    });

    // Start stdin listener
    std::thread stdinThread(stdinListenerThread);
    stdinThread.detach();

    // Do not announce readiness until the parallel preparation is complete.
    audioPreparation.get();
    if (cameraPreparation.valid() && !cameraPreparation.get()) {
        std::cerr << "ERROR: Requested camera could not provide a capture-clock frame" << std::endl;
        return 1;
    }
    if (config.captureMic && !micInitialized) {
        std::cerr << "ERROR: Requested microphone could not provide native timestamped audio" << std::endl;
        return 1;
    }

    // Start video capture, then audio immediately after for sync
    if (!session.startCapture()) {
        std::cerr << "ERROR: Failed to start WGC capture" << std::endl;
        return 1;
    }

    if (audioInitialized) {
        audioActive = loopback.start();
    }
    if (micInitialized) {
        micActive = micCapture.start();
        if (!micActive) {
            reportMicrophoneCaptureUnavailable();
        }
    }
    std::thread encodingThread([&]() {
        CoInitializeEx(nullptr, COINIT_MULTITHREADED);
        int64_t seededBoundary = -1;
        while (true) {
            PendingFrame frame;
            {
                std::unique_lock<std::mutex> lock(queueMutex);
                queueCv.wait_for(lock, std::chrono::milliseconds(2), [&]() { return queueClosed || !pendingFrames.empty(); });
                const auto boundary = g_timeline.activeBoundary(queryPerformanceCounterHns());
                // Publish the retained desktop at the agreed boundary, never its preparation timestamp.
                if (boundary && *boundary != seededBoundary && latestFrame.texture) {
                    seededBoundary = *boundary;
                    frame = latestFrame;
                    frame.qpc = *boundary;
                } else if (!pendingFrames.empty()) {
                    frame = std::move(pendingFrames.front()); pendingFrames.pop_front(); queuedBytes -= frame.bytes;
                } else if (queueClosed) break;
                else continue;
            }
            const auto elapsed = g_timeline.map(frame.qpc);
            if (!elapsed) continue;
            int64_t expectedFirst = -1;
            firstVideoTimestampHns.compare_exchange_strong(expectedFirst, frame.qpc - *elapsed);
            const int64_t frameIndex = *elapsed * config.fps / 10000000LL;
            if (frameIndex <= lastOutputFrame) continue;
            const int64_t outputTime = lastOutputFrame < 0 ? 0 : frameIndex * 10000000LL / config.fps;
            if (!encoder.writeFrame(frame.texture.Get(), outputTime) || (camera && !camera->writeReference(frame.texture.Get(), frame.qpc))) { encodingFailed = true; g_stopRequested = true; break; }
            lastOutputFrame = frameIndex;
            if (frameCount.fetch_add(1) == 0 && !recordingStartedAnnounced.exchange(true)) std::cout << "Recording started" << std::endl;
        }
        CoUninitialize();
    });
    captureSetupComplete = true;

    // Keep draining timestamped packets across pauses; every stream uses the same scheduled boundaries.
    while (!g_stopRequested && !session.hasFatalError()) {
        {
            std::lock_guard<std::mutex> lock(queueMutex);
            // A static source's first frame may arrive before parallel preparation finishes.
            if (captureSetupComplete && latestFrame.texture && !captureReadyAnnounced.exchange(true)) {
                const int64_t clockQpc = queryPerformanceCounterHns();
                std::cout << std::setprecision(17) << "CAPTURE_CLOCK {\"epochMs\":" << g_timeline.toEpoch(clockQpc) << ",\"monotonicMs\":" << static_cast<double>(clockQpc) / 10000.0 << "}" << std::endl;
                std::cout << "Capture preparation ms: " << std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - preparationStart).count() << std::endl;
                std::cout << "Capture ready" << std::endl;
                if (!config.deferStart) g_timeline.boundary(true, clockQpc);
            }
        }
        const int64_t stopBoundary = g_stopBoundaryHns.load();
        if (stopBoundary >= 0 && queryPerformanceCounterHns() >= stopBoundary + 1000000LL) {
            // Allow queued WASAPI packets to drain; packet slicing excludes every sample after stop.
            g_stopRequested = true;
            break;
        }

        std::unique_lock<std::mutex> lock(g_stopMutex);
        g_stopCv.wait_for(lock, std::chrono::milliseconds(2), [] { return g_stopRequested.load(); });
    }

    // Stop capture and finalize
    const int64_t stopBoundary = g_stopBoundaryHns.load();
    const int64_t adjustedStopTimestampHns = g_timeline.durationAt(stopBoundary >= 0 ? stopBoundary : queryPerformanceCounterHns());
    session.stopCapture();
    {
        std::lock_guard<std::mutex> lock(queueMutex);
        queueClosed = true;
    }
    queueCv.notify_one();
    encodingThread.join();
    if (audioActive) loopback.stop();
    if (micActive) micCapture.stop();
    if (camera && !camera->stop(adjustedStopTimestampHns)) encodingFailed = true;

    if (session.hasFatalError() || encodingFailed) {
        std::cerr << "ERROR: WGC capture session failed during recording" << std::endl;
        encoder.finalize();
        DeleteFileW(outputPathW.c_str());
        if (!config.cameraOutputPath.empty()) DeleteFileW(utf8ToWide(config.cameraOutputPath).c_str());
        if (!config.audioOutputPath.empty()) {
            const std::wstring audioPathW = utf8ToWide(config.audioOutputPath);
            const std::wstring audioMetadataPathW = utf8ToWide(config.audioOutputPath + ".json");
            DeleteFileW(audioPathW.c_str());
            DeleteFileW(audioMetadataPathW.c_str());
        }
        if (!config.micOutputPath.empty()) {
            const std::wstring micPathW = utf8ToWide(config.micOutputPath);
            const std::wstring micMetadataPathW = utf8ToWide(config.micOutputPath + ".json");
            DeleteFileW(micPathW.c_str());
            DeleteFileW(micMetadataPathW.c_str());
        }
        return 1;
    }

    if (audioActive) {
        writeCompanionAudioTimingMetadata(
            config.audioOutputPath,
            firstVideoTimestampHns.load(),
            loopback);
    }
    if (micActive) {
        writeCompanionAudioTimingMetadata(
            config.micOutputPath,
            firstVideoTimestampHns.load(),
            micCapture);
    }

    if (frameCount.load() <= 0) {
        std::cerr << "ERROR: No video frames were captured before stop" << std::endl;
        DeleteFileW(outputPathW.c_str());
        return 1;
    }

    // Every companion covers the same final output frame, without capturing post-stop content.
    const int64_t finalFrameCount = std::max<int64_t>(1, (adjustedStopTimestampHns * config.fps + 9999999LL) / 10000000LL);
    const int64_t finalDurationHns = finalFrameCount * 10000000LL / config.fps;
    if (!encoder.extendLastFrameTo(finalDurationHns)) {
        std::cerr << "WARNING: Failed to extend the last video frame to the stop timestamp" << std::endl;
    }

    if (!encoder.finalize()) {
        std::cerr << "ERROR: Failed to finalize Media Foundation encoder" << std::endl;
        return 1;
    }

    std::cout << "Recording stopped. Output path: " << config.outputPath << std::endl;
    if (camera) std::cout << "Camera path: " << config.cameraOutputPath << std::endl;
    if (audioActive) {
        if (
            loopback.dataDiscontinuityCount() > 0 ||
            loopback.timestampErrorCount() > 0 ||
            loopback.gapFillCount() > 0 ||
            loopback.compactedDiscontinuityCount() > 0 ||
            loopback.compactedSilentDiscontinuityCount() > 0
        ) {
            std::cerr << "WARNING: System audio timing metadata includes discontinuities="
                      << loopback.dataDiscontinuityCount()
                      << " timestampErrors=" << loopback.timestampErrorCount()
                      << " gapFills=" << loopback.gapFillCount()
                      << " insertedSilenceFrames=" << loopback.insertedSilenceFrames()
                      << " compactedDiscontinuities=" << loopback.compactedDiscontinuityCount()
                      << " compactedDiscontinuityFrames=" << loopback.compactedDiscontinuityFrames()
                      << " compactedSilentDiscontinuities=" << loopback.compactedSilentDiscontinuityCount()
                      << " compactedSilentDiscontinuityFrames=" << loopback.compactedSilentDiscontinuityFrames()
                      << std::endl;
        }
        std::cout << "Audio path: " << config.audioOutputPath << std::endl;
    }
    if (micActive) {
        if (
            micCapture.dataDiscontinuityCount() > 0 ||
            micCapture.timestampErrorCount() > 0 ||
            micCapture.gapFillCount() > 0 ||
            micCapture.compactedDiscontinuityCount() > 0 ||
            micCapture.compactedSilentDiscontinuityCount() > 0
        ) {
            std::cerr << "WARNING: Microphone timing metadata includes discontinuities="
                      << micCapture.dataDiscontinuityCount()
                      << " timestampErrors=" << micCapture.timestampErrorCount()
                      << " gapFills=" << micCapture.gapFillCount()
                      << " insertedSilenceFrames=" << micCapture.insertedSilenceFrames()
                      << " compactedDiscontinuities=" << micCapture.compactedDiscontinuityCount()
                      << " compactedDiscontinuityFrames=" << micCapture.compactedDiscontinuityFrames()
                      << " compactedSilentDiscontinuities=" << micCapture.compactedSilentDiscontinuityCount()
                      << " compactedSilentDiscontinuityFrames=" << micCapture.compactedSilentDiscontinuityFrames()
                      << std::endl;
        }
        std::cout << "Mic path: " << config.micOutputPath << std::endl;
    }
    std::cout.flush();

    // Allow pipe buffers to drain before forceful exit
    Sleep(100);

    // Fast exit to avoid WinRT/COM teardown crashes during apartment cleanup
    ExitProcess(0);
}
