using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

// A fresh Job belongs to one invocation. Suspended creation prevents an unowned child race.
internal static class CallAiJob {
  [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
    public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
    public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
    public uint ActiveProcessLimit;
    public UIntPtr Affinity;
    public uint PriorityClass, SchedulingClass;
  }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong A, B, C, D, E, F; }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
    public BasicLimits BasicLimitInformation;
    public IoCounters IoInfo;
    public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct StartupInfo {
    public int cb;
    public string reserved, desktop, title;
    public uint x, y, width, height, charX, charY, fill, flags;
    public short show, reserved2;
    public IntPtr reservedPtr, input, output, error;
  }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process, thread; public uint pid, tid; }
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits info, uint size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool CreateProcess(string app, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes, bool inherit, uint flags, IntPtr env, string cwd, ref StartupInfo startup, out ProcessInfo process);
  [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint timeout);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr handle, out uint code);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process, uint code);
  [DllImport("kernel32.dll")] static extern bool TerminateJobObject(IntPtr job, uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int kind);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);

  /// <summary>Quote a single argv value using Windows command line escaping.</summary>
  /// <param name="value">Literal argument.</param>
  /// <returns>One quoted command line argument.</returns>
  static string Quote(string value) {
    var result = new StringBuilder("\""); int slashes = 0;
    foreach (char ch in value) {
      if (ch == '\\') { slashes++; continue; }
      if (ch == '"') { result.Append('\\', slashes * 2 + 1); result.Append(ch); }
      else { result.Append('\\', slashes); result.Append(ch); }
      slashes = 0;
    }
    result.Append('\\', slashes * 2); result.Append('"'); return result.ToString();
  }

  /// <summary>Run one command inside a non-breakaway job and close all descendants on completion or owner exit.</summary>
  /// <param name="args">Owner PID followed by executable and argv.</param>
  /// <returns>The command exit status, or a launch error.</returns>
  static int Main(string[] args) {
    if (args.Length < 2) return 125;
    IntPtr job = IntPtr.Zero; ProcessInfo child = new ProcessInfo();
    try {
      job = CreateJobObject(IntPtr.Zero, null);
      if (job == IntPtr.Zero) throw new Win32Exception();
      var limits = new ExtendedLimits();
      limits.BasicLimitInformation.LimitFlags = 0x2000 | 0x8; // kill on last close; cap active process count.
      limits.BasicLimitInformation.ActiveProcessLimit = 64;
      if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits))) throw new Win32Exception();
      var startup = new StartupInfo(); startup.cb = Marshal.SizeOf(startup); startup.flags = 0x100;
      startup.input = GetStdHandle(-10); startup.output = GetStdHandle(-11); startup.error = GetStdHandle(-12);
      var command = new StringBuilder();
      for (int index = 1; index < args.Length; index++) { if (index > 1) command.Append(' '); command.Append(Quote(args[index])); }
      // No child instructions execute before the Job has accepted ownership.
      if (!CreateProcess(args[1], command, IntPtr.Zero, IntPtr.Zero, true, 0x4 | 0x08000000, IntPtr.Zero, Environment.CurrentDirectory, ref startup, out child)) throw new Win32Exception();
      if (!AssignProcessToJobObject(job, child.process)) throw new Win32Exception();
      var parent = OpenProcess(0x100000, false, int.Parse(args[0]));
      if (parent == IntPtr.Zero) throw new Win32Exception();
      IntPtr currentJob = job;
      var watcher = new Thread(() => { WaitForSingleObject(parent, 0xffffffff); TerminateJobObject(currentJob, 130); Environment.Exit(130); });
      watcher.IsBackground = true; watcher.Start();
      if (ResumeThread(child.thread) == 0xffffffff) throw new Win32Exception();
      WaitForSingleObject(child.process, 0xffffffff);
      uint status; GetExitCodeProcess(child.process, out status);
      // Closing the handle also handles descendants after the root command already exited.
      TerminateJobObject(job, status); return (int)status;
    } catch (Exception error) {
      if (child.process != IntPtr.Zero) TerminateProcess(child.process, 125);
      Console.Error.WriteLine("CallAI process isolation failed: " + error.Message); return 125;
    } finally {
      if (child.thread != IntPtr.Zero) CloseHandle(child.thread);
      if (child.process != IntPtr.Zero) CloseHandle(child.process);
      if (job != IntPtr.Zero) CloseHandle(job);
    }
  }
}
