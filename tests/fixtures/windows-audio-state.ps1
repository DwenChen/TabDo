param([ValidateSet('read', 'mute', 'unmute')][string]$Action = 'read')
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class AudioEnumerator {}
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEnumerator {
 [PreserveSig] int EnumAudioEndpoints(int flow, int state, out IntPtr devices);
 [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IAudioDevice device);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioDevice {
 [PreserveSig] int Activate(ref Guid iid, int context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object value);
}
[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IEndpointVolume {
 [PreserveSig] int RegisterControlChangeNotify(IntPtr callback);
 [PreserveSig] int UnregisterControlChangeNotify(IntPtr callback);
 [PreserveSig] int GetChannelCount(out uint count);
 [PreserveSig] int SetMasterVolumeLevel(float level, Guid context);
 [PreserveSig] int SetMasterVolumeLevelScalar(float level, Guid context);
 [PreserveSig] int GetMasterVolumeLevel(out float level);
 [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
 [PreserveSig] int SetChannelVolumeLevel(uint channel, float level, Guid context);
 [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float level, Guid context);
 [PreserveSig] int GetChannelVolumeLevel(uint channel, out float level);
 [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float level);
 [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool muted, Guid context);
 [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool muted);
}
public static class CaptureAudioState {
 public static string Run(string action) {
  IAudioEnumerator enumerator = (IAudioEnumerator)new AudioEnumerator();
  IAudioDevice device; object value; Guid iid = typeof(IEndpointVolume).GUID;
  Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 0, out device));
  Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out value));
  IEndpointVolume volume = (IEndpointVolume)value;
  try {
   if (action != "read") Marshal.ThrowExceptionForHR(volume.SetMute(action == "mute", Guid.Empty));
   bool muted; float level;
   Marshal.ThrowExceptionForHR(volume.GetMute(out muted));
   Marshal.ThrowExceptionForHR(volume.GetMasterVolumeLevelScalar(out level));
   return "{\"muted\":" + (muted ? "true" : "false") + ",\"volume\":" + level.ToString(System.Globalization.CultureInfo.InvariantCulture) + "}";
  } finally { Marshal.ReleaseComObject(volume); Marshal.ReleaseComObject(device); Marshal.ReleaseComObject(enumerator); }
 }
}
'@
[CaptureAudioState]::Run($Action)
