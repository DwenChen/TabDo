#pragma once
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <mmreg.h>
#include <ks.h>
#include <ksmedia.h>
#include <wrl/client.h>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <vector>
#include <iostream>

/**
 * Generate the owned 31ms phase-coded diagnostic pulse, distinct from background audio.
 * @param index Sample offset within the pulse.
 * @param sampleRate PCM frames per second.
 * @param phase Carrier phase, zero for emission and pi/2 for the matched quadrature.
 * @returns Signed mono PCM, or silence outside the pulse.
 */
inline float captureDiagnosticToneSample(int64_t index, int sampleRate, double phase = 0) {
    if (index < 0 || sampleRate <= 0) return 0;
    const double seconds = static_cast<double>(index) / sampleRate;
    const int chip = static_cast<int>(std::floor(seconds * 1000));
    if (chip >= 31) return 0;
    const double sign = ((0x6d2b79f5u >> chip) & 1u) ? 1.0 : -1.0;
    return static_cast<float>(0.35 * sign * std::sin(2.0 * 3.141592653589793 * 3000.0 * seconds + phase));
}

struct CaptureDiagnosticToneMatch { int sample = -1; double correlation = 0; };

/**
 * Locate the complete owned pulse by normalized waveform correlation, never loudness alone.
 * @param samples Observed mono PCM including any unrelated desktop audio.
 * @param sampleRate PCM frames per second.
 * @returns Reliable pulse start and correlation, or sample=-1 when no pulse matches.
 */
inline CaptureDiagnosticToneMatch findCaptureDiagnosticTone(const std::vector<float>& samples, int sampleRate) {
    CaptureDiagnosticToneMatch best;
    if (sampleRate <= 0) return best;
    const int length = static_cast<int>(std::ceil(sampleRate * 0.031));
    std::vector<float> reference(length), quadrature(length);
    std::vector<float> filtered(samples.size());
    // Apply identical differencing to both signals, rejecting low-frequency background without moving the sample origin.
    for (size_t i = 0; i < samples.size(); ++i) filtered[i] = samples[i] - (i ? samples[i - 1] : 0);
    for (int i = 0; i < length; ++i) {
        reference[i] = captureDiagnosticToneSample(i, sampleRate) - captureDiagnosticToneSample(i - 1, sampleRate);
        quadrature[i] = captureDiagnosticToneSample(i, sampleRate, 3.141592653589793 / 2) - captureDiagnosticToneSample(i - 1, sampleRate, 3.141592653589793 / 2);
    }
    struct Block { int first, last; double aa, bb, ab, determinant; };
    std::vector<Block> blocks;
    const int blockLength = std::max(1, static_cast<int>(std::round(sampleRate * 0.004)));
    for (int first = 0; first < length; first += blockLength) {
        Block block{first, std::min(length, first + blockLength), 0, 0, 0, 0};
        for (int i = block.first; i < block.last; ++i) { block.aa += reference[i] * reference[i]; block.bb += quadrature[i] * quadrature[i]; block.ab += reference[i] * quadrature[i]; }
        block.determinant = block.aa * block.bb - block.ab * block.ab;
        blocks.push_back(block);
    }
    // A click or arbitrary non-silent sample cannot satisfy a full coded waveform.
    for (int start = 0; start + length <= static_cast<int>(samples.size()); ++start) {
        double projected = 0, energy = 0;
        int coveredBlocks = 0;
        // Retain the phase code in each block while tolerating a capture-packet carrier phase change.
        for (const auto& block : blocks) {
            double a = 0, b = 0, blockEnergy = 0;
            for (int i = block.first; i < block.last; ++i) { const double value = filtered[start + i]; a += value * reference[i]; b += value * quadrature[i]; energy += value * value; blockEnergy += value * value; }
            if (block.determinant > 1e-12) {
                const double contribution = std::max(0.0, (block.bb * a * a + block.aa * b * b - 2 * block.ab * a * b) / block.determinant);
                projected += contribution;
                if (blockEnergy > (block.last - block.first) * 1e-8 && contribution >= blockEnergy * 0.36) ++coveredBlocks;
            }
        }
        const double correlation = energy > length * 1e-8 ? std::min(1.0, std::sqrt(projected / energy)) : 0;
        // Matching only the pulse tail must not beat a complete coded pulse.
        if (coveredBlocks >= static_cast<int>(std::ceil(blocks.size() * 0.75)) && correlation > best.correlation) best = {start, correlation};
    }
    if (best.correlation < 0.75) best.sample = -1;
    return best;
}

/**
 * Emit an owned pulse and match its actual PCM against an independent WASAPI capture client.
 * @returns QPC timestamp of the matched pulse origin, or -1 when capture or matching fails.
 */
inline int64_t playCaptureDiagnosticTone() {
    using Microsoft::WRL::ComPtr;
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    ComPtr<IMMDeviceEnumerator> enumerator;
    ComPtr<IMMDevice> device;
    ComPtr<IAudioClient> client, observer;
    ComPtr<IAudioRenderClient> render;
    ComPtr<IAudioCaptureClient> capture;
    WAVEFORMATEX* format = nullptr;
    if (FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&enumerator))) ||
        FAILED(enumerator->GetDefaultAudioEndpoint(eRender, eConsole, &device)) ||
        FAILED(device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, reinterpret_cast<void**>(client.GetAddressOf()))) ||
        FAILED(client->GetMixFormat(&format))) return -1;
    const auto cleanupFormat = [&]() { if (format) { CoTaskMemFree(format); format = nullptr; } };
    if (FAILED(client->Initialize(AUDCLNT_SHAREMODE_SHARED, 0, 1000000, 0, format, nullptr)) ||
        FAILED(client->GetService(IID_PPV_ARGS(&render))) ||
        FAILED(device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, reinterpret_cast<void**>(observer.GetAddressOf()))) ||
        FAILED(observer->Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK, 1000000, 0, format, nullptr)) ||
        FAILED(observer->GetService(IID_PPV_ARGS(&capture)))) { cleanupFormat(); return -1; }
    UINT32 frames = 0; BYTE* data = nullptr;
    if (FAILED(client->GetBufferSize(&frames)) || FAILED(render->GetBuffer(frames, &data))) { cleanupFormat(); return -1; }
    const bool floating = format->wFormatTag == WAVE_FORMAT_IEEE_FLOAT ||
        (format->wFormatTag == WAVE_FORMAT_EXTENSIBLE && reinterpret_cast<WAVEFORMATEXTENSIBLE*>(format)->SubFormat == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT);
    const int64_t preparationFrames = format->nSamplesPerSec / 20;
    /**
     * Fill the next device buffer without restarting the pulse at a packet boundary.
     * @param output Owned WASAPI render buffer.
     * @param count Number of writable PCM frames.
     * @param offset Total frames submitted before this buffer.
     * @returns No value; samples beyond the coded pulse are silence.
     */
    const auto fill = [&](BYTE* output, UINT32 count, int64_t offset) {
        ZeroMemory(output, count * format->nBlockAlign);
        for (UINT32 frame = 0; frame < count; ++frame) {
            const float value = captureDiagnosticToneSample(offset + frame - preparationFrames, format->nSamplesPerSec);
            for (UINT32 channel = 0; channel < format->nChannels; ++channel) {
                BYTE* sample = output + frame * format->nBlockAlign + channel * (format->wBitsPerSample / 8);
                if (floating && format->wBitsPerSample == 32) *reinterpret_cast<float*>(sample) = value;
                else if (format->wBitsPerSample == 16) *reinterpret_cast<int16_t*>(sample) = static_cast<int16_t>(value * 32767);
            }
        }
    };
    fill(data, frames, 0);
    int64_t submitted = frames;
    render->ReleaseBuffer(frames, 0);
    // Queuing time is not playback time; retain the endpoint QPC for every observed frame.
    if (FAILED(observer->Start()) || FAILED(client->Start())) { cleanupFormat(); return -1; }
    std::vector<float> observed;
    std::vector<int64_t> times;
    // Let endpoint startup settle in silence, then retain the complete pulse and its observed clock.
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(500);
    while (std::chrono::steady_clock::now() < deadline) {
        // Some endpoints expose less than a full pulse per buffer; submit its remaining samples.
        UINT32 padding = 0;
        if (SUCCEEDED(client->GetCurrentPadding(&padding)) && padding < frames) {
            const UINT32 writable = frames - padding;
            BYTE* output = nullptr;
            if (SUCCEEDED(render->GetBuffer(writable, &output))) {
                fill(output, writable, submitted);
                render->ReleaseBuffer(writable, 0);
                submitted += writable;
            }
        }
        UINT32 available = 0;
        if (FAILED(capture->GetNextPacketSize(&available))) break;
        while (available > 0) {
            BYTE* samples = nullptr; UINT32 count = 0; DWORD flags = 0; UINT64 position = 0, qpc = 0;
            if (FAILED(capture->GetBuffer(&samples, &count, &flags, &position, &qpc))) break;
            if (!(flags & AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR)) {
                for (UINT32 frame = 0; frame < count; ++frame) {
                    float mono = 0;
                    if (samples && !(flags & AUDCLNT_BUFFERFLAGS_SILENT)) {
                        for (UINT32 channel = 0; channel < format->nChannels; ++channel) {
                            const BYTE* sample = samples + frame * format->nBlockAlign + channel * (format->wBitsPerSample / 8);
                            if (floating && format->wBitsPerSample == 32) mono += *reinterpret_cast<const float*>(sample);
                            else if (format->wBitsPerSample == 16) mono += *reinterpret_cast<const int16_t*>(sample) / 32768.0f;
                        }
                    }
                    observed.push_back(mono / format->nChannels);
                    times.push_back(static_cast<int64_t>(qpc) + frame * 10000000LL / format->nSamplesPerSec);
                }
            }
            capture->ReleaseBuffer(count);
            if (FAILED(capture->GetNextPacketSize(&available))) break;
        }
        Sleep(1);
    }
    observer->Stop(); client->Stop();
    const auto match = findCaptureDiagnosticTone(observed, format->nSamplesPerSec);
    std::cerr << "DIAGNOSTIC_TONE rate=" << format->nSamplesPerSec << " buffer=" << frames << " observed=" << observed.size() << " correlation=" << match.correlation << " sample=" << match.sample << std::endl;
    cleanupFormat();
    return match.sample >= 0 ? times[match.sample] : -1;
}
