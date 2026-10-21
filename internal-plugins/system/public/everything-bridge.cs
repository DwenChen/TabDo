using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

// Native IPC protocol: https://www.voidtools.com/support/everything/sdk/ipc/
// Independent implementation. No Everything executable, SDK DLL or database is bundled.
public class TabDoEverything : NativeWindow, IDisposable {
  [StructLayout(LayoutKind.Sequential)]
  struct CopyData { public IntPtr id; public int length; public IntPtr data; }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr wp, IntPtr lp, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  public class Item { public string path; public string name; public bool isDirectory; }
  public class Result { public string state; public string executable; public uint total; public List<Item> items = new List<Item>(); }
  Result result;
  bool replied;

  /**
   * Create a hidden reply window for this search session.
   * @returns A disposable IPC receiver.
   */
  public TabDoEverything() { CreateHandle(new CreateParams()); }

  /**
   * Locate an existing Everything instance without starting or stopping it.
   * @param instance Optional user configured instance name.
   * @returns Existing IPC window handle, or zero.
   */
  IntPtr Locate(string instance) {
    if (!String.IsNullOrWhiteSpace(instance)) return FindWindow("EVERYTHING_TASKBAR_NOTIFICATION_(" + instance + ")", null);
    IntPtr hwnd = FindWindow("EVERYTHING_TASKBAR_NOTIFICATION", null);
    return hwnd != IntPtr.Zero ? hwnd : FindWindow("EVERYTHING_TASKBAR_NOTIFICATION_(1.5a)", null);
  }

  /**
   * Check IPC and database readiness with a bounded native call.
   * @param matchPath Match the complete file path when enabled.
   * @param instance Optional Everything instance.
   * @returns Readiness and the existing executable path when accessible.
   */
  public Result Status(string instance) {
    IntPtr hwnd = Locate(instance), value;
    Result state = new Result { state = "missing" };
    if (hwnd == IntPtr.Zero) return state;
    state.state = "indexing";
    uint pid; GetWindowThreadProcessId(hwnd, out pid);
    try { state.executable = Process.GetProcessById((int)pid).MainModule.FileName; } catch { }
    if (SendMessageTimeout(hwnd, 0x400, new IntPtr(401), IntPtr.Zero, 2, 1500, out value) == IntPtr.Zero) { state.state = "unresponsive"; return state; }
    if (value != IntPtr.Zero) state.state = "ready";
    return state;
  }

  /**
   * Query a live local database with Unicode query2 and bounded paging.
   * @param text Everything search expression.
   * @param offset First result offset.
   * @param sort SDK sort identifier.
   * @param regex Whether to match by regular expression.
   * @param matchCase Whether to match case.
   * @param matchPath Match the complete file path when enabled.
   * @param instance Optional instance name.
   * @returns At most 100 result paths and total matches.
   * @throws InvalidOperationException IPC denied or unsupported.
   * @throws TimeoutException Query did not reply before the deadline.
   */
  public Result Query(string text, int offset, int sort, bool regex, bool matchCase, string instance, bool matchPath = false) {
    Result status = Status(instance);
    if (status.state != "ready") return status;
    byte[] query = new byte[28 + Encoding.Unicode.GetByteCount(text + "\0")];
    Buffer.BlockCopy(BitConverter.GetBytes(unchecked((uint)Handle.ToInt64())), 0, query, 0, 4);
    Buffer.BlockCopy(BitConverter.GetBytes(77), 0, query, 4, 4);
    Buffer.BlockCopy(BitConverter.GetBytes((regex ? 8 : 0) | (matchCase ? 1 : 0) | (matchPath ? 2 : 0)), 0, query, 8, 4);
    Buffer.BlockCopy(BitConverter.GetBytes(Math.Max(0, offset)), 0, query, 12, 4);
    Buffer.BlockCopy(BitConverter.GetBytes(100), 0, query, 16, 4);
    Buffer.BlockCopy(BitConverter.GetBytes(4), 0, query, 20, 4);
    Buffer.BlockCopy(BitConverter.GetBytes(sort), 0, query, 24, 4);
    Buffer.BlockCopy(Encoding.Unicode.GetBytes(text + "\0"), 0, query, 28, query.Length - 28);
    IntPtr data = Marshal.AllocHGlobal(query.Length), copy = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(CopyData))), accepted;
    try {
      Marshal.Copy(query, 0, data, query.Length);
      Marshal.StructureToPtr(new CopyData { id = new IntPtr(18), length = query.Length, data = data }, copy, false);
      replied = false; result = new Result { state = "ready", executable = status.executable };
      if (SendMessageTimeout(Locate(instance), 0x4a, Handle, copy, 2, 2000, out accepted) == IntPtr.Zero || accepted == IntPtr.Zero) throw new InvalidOperationException("Everything IPC denied. Use a standard non-Lite instance with the same user privileges.");
      Stopwatch watch = Stopwatch.StartNew();
      while (!replied && watch.ElapsedMilliseconds < 8000) { Application.DoEvents(); Thread.Sleep(5); }
      if (!replied) throw new TimeoutException("Everything query timeout.");
      return result;
    } finally { Marshal.FreeHGlobal(copy); Marshal.FreeHGlobal(data); result = null; }
  }

  /**
   * Copy and validate the query2 reply before Everything releases the message buffer.
   * @param message Current Win32 message.
   * @returns No return value.
   */
  protected override void WndProc(ref Message message) {
    if (message.Msg == 0x4a && result != null) {
      CopyData copy = (CopyData)Marshal.PtrToStructure(message.LParam, typeof(CopyData));
      if (copy.id.ToInt64() == 77 && copy.length >= 20 && copy.length < 32 * 1024 * 1024) {
        byte[] bytes = new byte[copy.length]; Marshal.Copy(copy.data, bytes, 0, bytes.Length);
        uint count = BitConverter.ToUInt32(bytes, 4);
        if (count <= 100 && 20 + count * 8 <= bytes.Length && (BitConverter.ToUInt32(bytes, 12) & 4) != 0) {
          result.total = BitConverter.ToUInt32(bytes, 0);
          for (int i = 0; i < count; i++) {
            int flags = BitConverter.ToInt32(bytes, 20 + i * 8), pos = BitConverter.ToInt32(bytes, 24 + i * 8);
            if (pos < 20 || pos > bytes.Length - 4) continue;
            int length = BitConverter.ToInt32(bytes, pos);
            if (length < 0 || length > (bytes.Length - pos - 4) / 2) continue;
            string full = Encoding.Unicode.GetString(bytes, pos + 4, length * 2);
            result.items.Add(new Item { path = full, name = System.IO.Path.GetFileName(full.TrimEnd('\\')), isDirectory = (flags & 1) != 0 });
          }
          replied = true; message.Result = new IntPtr(1); return;
        }
      }
    }
    base.WndProc(ref message);
  }

  /**
   * Release the reply window and result references when the tool session exits.
   * @returns No return value.
   */
  public void Dispose() { result = null; DestroyHandle(); }
}
