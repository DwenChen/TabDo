$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

# 独立 STA 进程使用系统回收站；禁止提权、交互提示及退化为永久删除。
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace TabDo.Recording {
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IShellItem {
    void BindToHandler(IntPtr context, ref Guid handler, ref Guid iid, out IntPtr result);
    void GetParent(out IShellItem parent);
    void GetDisplayName(uint kind, out IntPtr name);
    void GetAttributes(uint mask, out uint attributes);
    void Compare(IShellItem other, uint hint, out int order);
  }

  [ComVisible(true), Guid("04B0F1A7-9490-44BC-96E1-4296A31252E2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IProgressSink {
    [PreserveSig] int StartOperations();
    [PreserveSig] int FinishOperations(int result);
    [PreserveSig] int PreRenameItem(uint flags, IShellItem item, [MarshalAs(UnmanagedType.LPWStr)] string name);
    [PreserveSig] int PostRenameItem(uint flags, IShellItem item, [MarshalAs(UnmanagedType.LPWStr)] string name, int result, IShellItem created);
    [PreserveSig] int PreMoveItem(uint flags, IShellItem item, IShellItem folder, [MarshalAs(UnmanagedType.LPWStr)] string name);
    [PreserveSig] int PostMoveItem(uint flags, IShellItem item, IShellItem folder, [MarshalAs(UnmanagedType.LPWStr)] string name, int result, IShellItem created);
    [PreserveSig] int PreCopyItem(uint flags, IShellItem item, IShellItem folder, [MarshalAs(UnmanagedType.LPWStr)] string name);
    [PreserveSig] int PostCopyItem(uint flags, IShellItem item, IShellItem folder, [MarshalAs(UnmanagedType.LPWStr)] string name, int result, IShellItem created);
    [PreserveSig] int PreDeleteItem(uint flags, IShellItem item);
    [PreserveSig] int PostDeleteItem(uint flags, IShellItem item, int result, IShellItem created);
    [PreserveSig] int PreNewItem(uint flags, IShellItem folder, [MarshalAs(UnmanagedType.LPWStr)] string name);
    [PreserveSig] int PostNewItem(uint flags, IShellItem folder, [MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.LPWStr)] string template, uint attributes, int result, IShellItem created);
    [PreserveSig] int UpdateProgress(uint total, uint done);
    [PreserveSig] int ResetTimer();
    [PreserveSig] int PauseTimer();
    [PreserveSig] int ResumeTimer();
  }

  [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
  public class RecycleGuard : IProgressSink {
    public int Error;
    public int StartOperations() { return 0; }
    public int FinishOperations(int result) { if (result < 0) Error = result; return 0; }
    public int PreRenameItem(uint f, IShellItem i, string n) { return 0; }
    public int PostRenameItem(uint f, IShellItem i, string n, int r, IShellItem c) { return 0; }
    public int PreMoveItem(uint f, IShellItem i, IShellItem d, string n) { return 0; }
    public int PostMoveItem(uint f, IShellItem i, IShellItem d, string n, int r, IShellItem c) { return 0; }
    public int PreCopyItem(uint f, IShellItem i, IShellItem d, string n) { return 0; }
    public int PostCopyItem(uint f, IShellItem i, IShellItem d, string n, int r, IShellItem c) { return 0; }
    // TSF_DELETE_RECYCLE_IF_POSSIBLE 必须存在；不可回收时立即中止。
    public int PreDeleteItem(uint f, IShellItem i) { return (f & 0x80) != 0 ? 0 : unchecked((int)0x80004004); }
    public int PostDeleteItem(uint f, IShellItem i, int r, IShellItem c) { if (r < 0) Error = r; return 0; }
    public int PreNewItem(uint f, IShellItem d, string n) { return 0; }
    public int PostNewItem(uint f, IShellItem d, string n, string t, uint a, int r, IShellItem c) { return 0; }
    public int UpdateProgress(uint total, uint done) { return 0; }
    public int ResetTimer() { return 0; }
    public int PauseTimer() { return 0; }
    public int ResumeTimer() { return 0; }
  }

  [ComImport, Guid("947AAB5F-0A5C-4C13-B4D6-4BF7836FC9F8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IFileOperation {
    void Advise(IProgressSink sink, out uint cookie);
    void Unadvise(uint cookie);
    void SetOperationFlags(uint flags);
    void SetProgressMessage([MarshalAs(UnmanagedType.LPWStr)] string message);
    void SetProgressDialog(IntPtr dialog);
    void SetProperties(IntPtr properties);
    void SetOwnerWindow(IntPtr owner);
    void ApplyPropertiesToItem(IShellItem item);
    void ApplyPropertiesToItems(IntPtr items);
    void RenameItem(IShellItem item, [MarshalAs(UnmanagedType.LPWStr)] string name, IProgressSink sink);
    void RenameItems(IntPtr items, [MarshalAs(UnmanagedType.LPWStr)] string name);
    void MoveItem(IShellItem item, IShellItem folder, [MarshalAs(UnmanagedType.LPWStr)] string name, IProgressSink sink);
    void MoveItems(IntPtr items, IShellItem folder);
    void CopyItem(IShellItem item, IShellItem folder, [MarshalAs(UnmanagedType.LPWStr)] string name, IProgressSink sink);
    void CopyItems(IntPtr items, IShellItem folder);
    void DeleteItem(IShellItem item, IProgressSink sink);
    void DeleteItems(IntPtr items);
    void NewItem(IShellItem folder, uint attributes, [MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.LPWStr)] string template, IProgressSink sink);
    void PerformOperations();
    void GetAnyOperationsAborted([MarshalAs(UnmanagedType.Bool)] out bool aborted);
  }

  public static class Recycle {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SHCreateItemFromParsingName(string path, IntPtr context, ref Guid iid, out IShellItem item);

    // 仅执行本次已校验的暂存包，归还 COM 引用后退出辅助进程。
    public static void Move(string path) {
      IFileOperation operation = null;
      IShellItem item = null;
      try {
        operation = (IFileOperation)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("3AD05575-8857-4850-9277-11B85BDB8E09")));
        // FOF_NO_UI | ADDUNDORECORD | RECYCLEONDELETE | EARLYFAILURE，不带 SHOWELEVATIONPROMPT。
        operation.SetOperationFlags(0x20180614);
        var iid = typeof(IShellItem).GUID;
        SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out item);
        var guard = new RecycleGuard();
        operation.DeleteItem(item, guard);
        operation.PerformOperations();
        bool aborted;
        operation.GetAnyOperationsAborted(out aborted);
        if (guard.Error < 0) Marshal.ThrowExceptionForHR(guard.Error);
        if (aborted) Marshal.ThrowExceptionForHR(unchecked((int)0x80004004));
      } finally {
        if (item != null) Marshal.FinalReleaseComObject(item);
        if (operation != null) Marshal.FinalReleaseComObject(operation);
      }
    }
  }
}
'@

try {
  [TabDo.Recording.Recycle]::Move($env:TABDO_RECORDING_TRASH_PATH)
  @{ success = $true } | ConvertTo-Json -Compress
} catch {
  $failure = $_.Exception
  while ($failure.InnerException) { $failure = $failure.InnerException }
  @{ success = $false; hresult = ('0x{0:X8}' -f $failure.HResult); message = $failure.Message } | ConvertTo-Json -Compress
}
