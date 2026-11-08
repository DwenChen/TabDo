# Windows 无指针采集程序

源于本模块注明的 Recordly 提交，继续保留原项目许可。2026-11-05 起仓库的 Windows x64 `wgc-capture.exe` 从此目录源码本地编译，包含 TabDo 共同捕获时钟协议。`electron/native/bin` 内的原上游 helpers-manifest 保留来源记录；`resources/presentation/native/bin/win32-x64/helpers-manifest.json` 由本地构建脚本记录当次二进制、源目录指纹与工具链版本，作为实际分发程序的构建收据。

准备阶段并行启动 WGC、MediaFrameReader 摄像头、WASAPI 和编码器，取得真实 WGC 帧后报告 `Capture ready`，不将准备画面或声音写入正式时间轴。`deferStart` 会话由宿主发送 `start <epochMs>` 提交起点；`pause`、`resume`、`stop` 同样接受精确 epoch 毫秒。Windows UTC 与 QPC 在进程初始化时校准一次，各路内容以采集时间决定归属，管道消息到达和封装完成时间不作为画面起止时间。音频包按同一有效区间精确切片，并按目的样本位置填充真实缺口；暂停期间继续排空设备队列。摄像头由 MediaFrameReader 提供 SystemRelativeTime，与 WGC 和 WASAPI 共用 QPC；视频独立编码线程和有界队列不阻塞采集回调。相机 MP4 与画面共用 60Hz 输出时间轴，硬件相机原始帧率可以更低。WGC 始终禁用系统指针合成，窗口使用真正的 CreateForWindow，屏幕和区域使用显示器捕获。未提交的准备会话取消时只清理本次明确生成的文件。

静态窗口无需持续刷新。采集回调保留一份最新真实帧；开始或恢复边界到达时，编码线程用该快照衔接画面。准备回执同样检查已经到达的帧，不依赖设备准备完成之后必须再推送一帧。

连续WASAPI包使用可靠首包QPC与设备帧计数关联，避免逐包QPC抖动造成连续PCM的静音插入或采样裁切。无效时间戳沿已取得的样本时钟推进，真实缺口或设备重置重新校准；暂停仍按共同时间轴切片。设备位置以流内音频帧计数表达，QPC位置以100ns表达，参见[Microsoft GetBuffer契约](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudiocaptureclient-getbuffer)。不同硬件的长时钟漂移继续列为设备验收边界。

声音诊断仅在显式E2E环境启用，发送31ms相位编码短音，由独立WASAPI客户端匹配PCM波形并保留端点QPC，不再把任意非静音采样当作脉冲起点。原生与脚本均对输入和模板作差分，并按4ms分段进行正交投影，容许包间载波相位变化而不相消；仍须匹配完整编码短音，未编码的同频普通声音不能通过。两路实际伴随文件使用相同模板匹配；源码专项主动加入440Hz背景声音并检查其录入，实际时间差仍须小于一帧。离线 `--test-tone-detector` 校验原生算法与脚本检测的一致性，不能替代真实回环与捕获时钟验证。该诊断改动不改变正式录制的采集、切片或编码时间边界。

在 Windows 上准备 MSVC x64 与 Windows SDK（含 C++/WinRT）后，设置 `TABDO_MSVC_ROOT` 指向同时包含 `VC/Tools/MSVC` 与 `Windows Kits/10` 的目录，执行：

```powershell
$env:TABDO_MSVC_ROOT = 'C:\path\to\toolchain'
node scripts/build-presentation-native.cjs
```

脚本在 `.artifacts/native/presentation-wgc/` 编译并链接，成功后才复制到 `resources/presentation/native/bin/win32-x64/wgc-capture.exe`。本轮使用 MSVC 14.44.35207、SDK 10.0.26100.0 和静态 C 运行库；工具链及下载文件不进入发行资源。也可使用当前 CMake 工程和同等工具链构建。修改此程序后须同时交付源码和重编译程序，不能只改源码或继续使用旧二进制。

源码 Electron 验证通过 `pnpm test:e2e`，无需打包 Electron。`presentation-cursor-capture` 保留真实指针阳性对照；`presentation-synchronization` 仅替换物理传感器来源：实际 WGC 时间码进入两个独立原生编码器，两路实际 WASAPI 客户端录入正向音频脉冲，第三路独立 WASAPI 客户端提供 PCM 的 QPC 参考，验证内容与键鼠时钟；只有同时设置 TABDO_E2E 和对应参考源环境变量才启用替换。`presentation-native-camera` 另行验证真实摄像头能提供带 SystemRelativeTime 的准备帧及取消清理，准备取消不发布素材；短时正式录制只核验两路时长，临时人像随隔离目录删除，归档仅保留数值；`presentation-recorder` 覆盖预览、编辑、实际导出和资源回收。容器时长相等不能单独作为内容同步的通过条件。实际摄像头传感器、音频驱动、多显示器及其他 DPI 仍需在对应设备验收。
