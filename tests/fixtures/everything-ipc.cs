using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public static class EverythingFixture {
  delegate IntPtr Procedure(IntPtr hwnd, uint message, IntPtr wp, IntPtr lp);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct WindowClass { public uint style; public Procedure proc; public int clsExtra; public int wndExtra; public IntPtr instance; public IntPtr icon; public IntPtr cursor; public IntPtr brush; public string menu; public string name; }
  [StructLayout(LayoutKind.Sequential)] struct CopyData { public IntPtr id; public int length; public IntPtr data; }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern ushort RegisterClass(ref WindowClass wc);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr CreateWindowEx(uint ex, string cls, string title, uint style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr param);
  [DllImport("user32.dll")] static extern IntPtr DefWindowProc(IntPtr hwnd, uint msg, IntPtr wp, IntPtr lp);
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hwnd, uint msg, IntPtr wp, IntPtr lp);
  static Procedure procedure = Handle;
  static string log;

  /**
   * Handle only read-only SDK messages in a uniquely named fake instance.
   * @param hwnd Fixture window.
   * @param message Win32 message.
   * @param wp Message parameter.
   * @param lp Message parameter.
   * @returns Native reply value.
   */
  static IntPtr Handle(IntPtr hwnd, uint message, IntPtr wp, IntPtr lp) {
    if (message == 0x400 && wp.ToInt64() == 401) return new IntPtr(1);
    if (message == 0x4a) {
      CopyData request = (CopyData)Marshal.PtrToStructure(lp, typeof(CopyData));
      if (request.id.ToInt64() != 18) return IntPtr.Zero;
      byte[] query = new byte[request.length]; Marshal.Copy(request.data, query, 0, query.Length);
      File.WriteAllText(log, BitConverter.ToInt32(query, 8) + "|" + BitConverter.ToInt32(query, 12) + "|" + BitConverter.ToInt32(query, 16) + "|" + BitConverter.ToInt32(query, 20) + "|" + BitConverter.ToInt32(query, 24) + "|" + Encoding.Unicode.GetString(query, 28, query.Length - 30), Encoding.UTF8);
      int offset = BitConverter.ToInt32(query, 12), count = offset >= 100 ? 1 : 100;
      byte[][] paths = new byte[count][];
      int length = 20 + count * 8;
      for (int i = 0; i < count; i++) { paths[i] = Encoding.Unicode.GetBytes("C:\\fixture\\\u6587\u4ef6-" + (offset + i) + ".txt\0"); length += paths[i].Length + 4; }
      byte[] result = new byte[length];
      Buffer.BlockCopy(BitConverter.GetBytes(101), 0, result, 0, 4); Buffer.BlockCopy(BitConverter.GetBytes(count), 0, result, 4, 4); Buffer.BlockCopy(BitConverter.GetBytes(offset), 0, result, 8, 4); Buffer.BlockCopy(BitConverter.GetBytes(4), 0, result, 12, 4); Buffer.BlockCopy(BitConverter.GetBytes(1), 0, result, 16, 4);
      int position = 20 + count * 8;
      for (int i = 0; i < count; i++) { Buffer.BlockCopy(BitConverter.GetBytes(position), 0, result, 24 + i * 8, 4); Buffer.BlockCopy(BitConverter.GetBytes(paths[i].Length / 2 - 1), 0, result, position, 4); Buffer.BlockCopy(paths[i], 0, result, position + 4, paths[i].Length); position += paths[i].Length + 4; }
      IntPtr data = Marshal.AllocHGlobal(result.Length), copy = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(CopyData)));
      try { Marshal.Copy(result, 0, data, result.Length); Marshal.StructureToPtr(new CopyData { id = new IntPtr(BitConverter.ToInt32(query, 4)), length = result.Length, data = data }, copy, false); SendMessage(new IntPtr((long)BitConverter.ToUInt32(query, 0)), 0x4a, hwnd, copy); } finally { Marshal.FreeHGlobal(copy); Marshal.FreeHGlobal(data); }
      return new IntPtr(1);
    }
    return DefWindowProc(hwnd, message, wp, lp);
  }
  /**
   * Start an invisible test IPC instance without accessing Everything itself.
   * @param instance Unique test name.
   * @param output Request capture in the temporary test directory.
   * @returns No return value until the test ends the fixture process.
   */
  public static void Run(string instance, string output) {
    log = output;
    WindowClass wc = new WindowClass { name = "EVERYTHING_TASKBAR_NOTIFICATION_(" + instance + ")", proc = procedure };
    if (RegisterClass(ref wc) == 0) throw new Exception("Fixture window registration failed.");
    if (CreateWindowEx(0, wc.name, "TabDo test fixture", 0, 0, 0, 0, 0, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero) == IntPtr.Zero) throw new Exception("Fixture window creation failed.");
    Console.WriteLine("ready"); Application.Run();
  }
}
