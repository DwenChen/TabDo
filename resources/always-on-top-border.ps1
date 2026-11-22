$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Drawing

# 置顶高亮边框辅助进程：使用 WinEvent 钩子跟随目标窗口，并以分层窗口绘制。
# 协议：stdin 每行一条命令，pin|hwnd|color|opacity|thickness|rounded，
#       style|color|opacity|thickness|rounded，unpin|hwnd，quit。
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class TabDoPinBorder
{
    private const int WM_APP_DRAIN = 0x8000 + 1;
    private const uint EVENT_OBJECT_DESTROY = 0x8001;
    private const uint EVENT_OBJECT_SHOW = 0x8002;
    private const uint EVENT_OBJECT_HIDE = 0x8003;
    private const uint EVENT_OBJECT_LOCATIONCHANGE = 0x800B;
    private const uint EVENT_SYSTEM_FOREGROUND = 0x0003;
    private const uint EVENT_SYSTEM_MINIMIZESTART = 0x0016;
    private const uint EVENT_SYSTEM_MINIMIZEEND = 0x0017;
    private const int OBJID_WINDOW = 0;
    private const uint WINEVENT_OUTOFCONTEXT = 0x0000;
    private const uint WINEVENT_SKIPOWNPROCESS = 0x0002;

    private const int WS_EX_LAYERED = 0x00080000;
    private const int WS_EX_TRANSPARENT = 0x00000020;
    private const int WS_EX_TOOLWINDOW = 0x00000080;
    private const int WS_EX_TOPMOST = 0x00000008;
    private const int WS_EX_NOACTIVATE = 0x08000000;
    private const int WS_POPUP = unchecked((int)0x80000000);
    private static readonly IntPtr HWND_MESSAGE = new IntPtr(-3);
    private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_SHOWWINDOW = 0x0040;
    private const uint SWP_NOOWNERZORDER = 0x0200;
    private const uint SWP_NOSENDCHANGING = 0x0400;
    private const uint ULW_ALPHA = 0x00000002;
    private const int SW_HIDE = 0;
    private const int SW_SHOWNOACTIVATE = 4;

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct SIZE { public int cx; public int cy; }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct BLENDFUNCTION { public byte BlendOp; public byte BlendFlags; public byte SourceConstantAlpha; public byte AlphaFormat; }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public POINT pt; }

    private delegate void WinEventDelegate(IntPtr hook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint thread, uint time);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateWindowEx(int exStyle, string className, string windowName, int style, int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr param);
    [DllImport("user32.dll")]
    private static extern bool DestroyWindow(IntPtr hwnd);
    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hwnd, int command);
    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr hwnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")]
    private static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr dstDc, ref POINT dstPoint, ref SIZE size, IntPtr srcDc, ref POINT srcPoint, int colorKey, ref BLENDFUNCTION blend, uint flags);
    [DllImport("user32.dll")]
    private static extern IntPtr GetDC(IntPtr hwnd);
    [DllImport("user32.dll")]
    private static extern int ReleaseDC(IntPtr hwnd, IntPtr dc);
    [DllImport("gdi32.dll")]
    private static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")]
    private static extern bool DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll")]
    private static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr obj);
    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr hwnd);
    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out RECT rect, int size);
    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out int value, int size);
    [DllImport("user32.dll")]
    private static extern IntPtr SetWinEventHook(uint eventMin, uint eventMax, IntPtr module, WinEventDelegate callback, uint processId, uint threadId, uint flags);
    [DllImport("user32.dll")]
    private static extern bool GetMessage(out MSG message, IntPtr hwnd, uint min, uint max);
    [DllImport("user32.dll")]
    private static extern bool TranslateMessage(ref MSG message);
    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage(ref MSG message);
    [DllImport("user32.dll")]
    private static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    private static extern void PostQuitMessage(int code);
    [DllImport("user32.dll")]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    private sealed class BorderWindow
    {
        public long Target;
        public IntPtr Hwnd;
        public int Width;
        public int Height;
        public int Thickness;
        public int StyleVersion;
        public bool Shown;
    }

    private static readonly object QueueLock = new object();
    private static readonly Queue<string> Commands = new Queue<string>();
    private static readonly Dictionary<long, BorderWindow> Borders = new Dictionary<long, BorderWindow>();
    private static readonly List<IntPtr> Hooks = new List<IntPtr>();
    private static readonly List<WinEventDelegate> Delegates = new List<WinEventDelegate>();

    private static IntPtr HostWindow = IntPtr.Zero;
    private static int ColorR = 26;
    private static int ColorG = 115;
    private static int ColorB = 232;
    private static int Opacity = 100;
    private static int Thickness = 3;
    private static bool Rounded = true;
    private static int StyleVersion = 1;

    public static void Run()
    {
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); }
        catch { try { SetProcessDPIAware(); } catch { } }

        HostWindow = CreateWindowEx(0, "STATIC", "TabDoAotBorderHost", 0, 0, 0, 0, 0, HWND_MESSAGE, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
        if (HostWindow == IntPtr.Zero) throw new InvalidOperationException("cannot create message window");

        AddHook(EVENT_OBJECT_LOCATIONCHANGE, EVENT_OBJECT_LOCATIONCHANGE, "location");
        AddHook(EVENT_OBJECT_DESTROY, EVENT_OBJECT_HIDE, "state");
        AddHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, "foreground");
        AddHook(EVENT_SYSTEM_MINIMIZESTART, EVENT_SYSTEM_MINIMIZESTART, "minimize");
        AddHook(EVENT_SYSTEM_MINIMIZEEND, EVENT_SYSTEM_MINIMIZEEND, "restore");

        Thread reader = new Thread(ReadCommands);
        reader.IsBackground = true;
        reader.Start();

        MSG message;
        while (GetMessage(out message, IntPtr.Zero, 0, 0))
        {
            if (message.message == WM_APP_DRAIN)
            {
                DrainCommands();
                continue;
            }
            TranslateMessage(ref message);
            DispatchMessage(ref message);
        }
    }

    private static void AddHook(uint min, uint max, string kind)
    {
        WinEventDelegate callback;
        if (kind == "location") callback = OnLocation;
        else if (kind == "state") callback = OnState;
        else if (kind == "foreground") callback = OnForeground;
        else if (kind == "minimize") callback = OnMinimizeStart;
        else callback = OnMinimizeEnd;
        Delegates.Add(callback);
        Hooks.Add(SetWinEventHook(min, max, IntPtr.Zero, callback, 0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS));
    }

    private static void ReadCommands()
    {
        try
        {
            string line;
            while ((line = Console.In.ReadLine()) != null)
            {
                lock (QueueLock) Commands.Enqueue(line);
                PostMessage(HostWindow, WM_APP_DRAIN, IntPtr.Zero, IntPtr.Zero);
            }
        }
        catch { }
        // 宿主关闭 stdin 后结束自身，避免留下常驻进程。
        lock (QueueLock) Commands.Enqueue("quit");
        PostMessage(HostWindow, WM_APP_DRAIN, IntPtr.Zero, IntPtr.Zero);
    }

    private static void DrainCommands()
    {
        while (true)
        {
            string line = null;
            lock (QueueLock)
            {
                if (Commands.Count > 0) line = Commands.Dequeue();
            }
            if (line == null) return;
            HandleCommand(line);
        }
    }

    private static void HandleCommand(string line)
    {
        string[] parts = line.Split('|');
        if (parts.Length == 0) return;
        string command = parts[0];
        if (command == "quit")
        {
            PostQuitMessage(0);
            return;
        }
        if (command == "style" && parts.Length >= 5)
        {
            ApplyStyle(parts[1], parts[2], parts[3], parts[4]);
            StyleVersion++;
            foreach (BorderWindow border in Borders.Values) Apply(border);
            return;
        }
        if (command == "pin" && parts.Length >= 6)
        {
            long target;
            if (!long.TryParse(parts[1], out target)) return;
            ApplyStyle(parts[2], parts[3], parts[4], parts[5]);
            BorderWindow border;
            if (!Borders.TryGetValue(target, out border))
            {
                IntPtr hwnd = CreateWindowEx(
                    WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST,
                    "STATIC", "TabDoAotBorder|" + target, WS_POPUP, 0, 0, 1, 1,
                    IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
                if (hwnd == IntPtr.Zero) return;
                border = new BorderWindow { Target = target, Hwnd = hwnd };
                Borders[target] = border;
            }
            Apply(border);
            return;
        }
        if (command == "unpin" && parts.Length >= 2)
        {
            long target;
            if (!long.TryParse(parts[1], out target)) return;
            Remove(target);
        }
    }

    private static void ApplyStyle(string color, string opacity, string thickness, string rounded)
    {
        if (color.StartsWith("#") && color.Length >= 7)
        {
            try
            {
                ColorR = Convert.ToInt32(color.Substring(1, 2), 16);
                ColorG = Convert.ToInt32(color.Substring(3, 2), 16);
                ColorB = Convert.ToInt32(color.Substring(5, 2), 16);
            }
            catch { }
        }
        int value;
        if (int.TryParse(opacity, out value)) Opacity = Math.Max(0, Math.Min(100, value));
        if (int.TryParse(thickness, out value)) Thickness = Math.Max(1, Math.Min(10, value));
        Rounded = rounded == "1";
    }

    private static void OnLocation(IntPtr hook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint thread, uint time)
    {
        if (idObject != OBJID_WINDOW || idChild != 0) return;
        BorderWindow border;
        if (hwnd != IntPtr.Zero && Borders.TryGetValue(hwnd.ToInt64(), out border)) Apply(border);
    }

    private static void OnState(IntPtr hook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint thread, uint time)
    {
        if (idObject != OBJID_WINDOW || hwnd == IntPtr.Zero) return;
        long key = hwnd.ToInt64();
        BorderWindow border;
        if (!Borders.TryGetValue(key, out border)) return;
        if (eventType == EVENT_OBJECT_DESTROY) Remove(key);
        else Apply(border);
    }

    private static void OnForeground(IntPtr hook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint thread, uint time)
    {
        // 前台窗口可能盖住同为置顶的边框，重新抬升全部边框窗口。
        foreach (BorderWindow border in Borders.Values)
        {
            SetWindowPos(border.Hwnd, HWND_TOPMOST, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_NOSENDCHANGING);
        }
    }

    private static void OnMinimizeStart(IntPtr hook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint thread, uint time)
    {
        BorderWindow border;
        if (hwnd != IntPtr.Zero && Borders.TryGetValue(hwnd.ToInt64(), out border)) ShowWindow(border.Hwnd, SW_HIDE);
    }

    private static void OnMinimizeEnd(IntPtr hook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint thread, uint time)
    {
        BorderWindow border;
        if (hwnd != IntPtr.Zero && Borders.TryGetValue(hwnd.ToInt64(), out border)) Apply(border);
    }

    private static void Remove(long target)
    {
        BorderWindow border;
        if (!Borders.TryGetValue(target, out border)) return;
        Borders.Remove(target);
        if (border.Hwnd != IntPtr.Zero) DestroyWindow(border.Hwnd);
    }

    private static bool IsCloaked(IntPtr hwnd)
    {
        int cloaked;
        return DwmGetWindowAttribute(hwnd, 14, out cloaked, 4) == 0 && cloaked != 0;
    }

    private static RECT GetTargetRect(IntPtr hwnd)
    {
        RECT rect;
        // DWM 扩展边界排除左右和底部的不可见缩放边框，直接贴合窗口可见边缘；
        // GetWindowRect 会把这段 7–8px 的边框算进去，导致高亮框向外偏移。
        if (DwmGetWindowAttribute(hwnd, 9, out rect, Marshal.SizeOf(typeof(RECT))) == 0 &&
            rect.Right > rect.Left && rect.Bottom > rect.Top)
            return rect;
        if (!GetWindowRect(hwnd, out rect)) { rect.Left = rect.Top = rect.Right = rect.Bottom = 0; }
        return rect;
    }

    private static void Apply(BorderWindow border)
    {
        IntPtr target = new IntPtr(border.Target);
        if (!IsWindow(target)) { Remove(border.Target); return; }
        if (!IsWindowVisible(target) || IsIconic(target) || IsCloaked(target))
        {
            ShowWindow(border.Hwnd, SW_HIDE);
            border.Shown = false;
            return;
        }

        RECT rect = GetTargetRect(target);
        int width = rect.Right - rect.Left;
        int height = rect.Bottom - rect.Top;
        if (width <= 0 || height <= 0) { ShowWindow(border.Hwnd, SW_HIDE); border.Shown = false; return; }

        uint dpi = GetDpiForWindow(target);
        if (dpi == 0) dpi = 96;
        int thickness = Math.Max(1, (int)Math.Round(Thickness * dpi / 96.0));
        int outerWidth = width + thickness * 2;
        int outerHeight = height + thickness * 2;
        int x = rect.Left - thickness;
        int y = rect.Top - thickness;

        bool sizeChanged = outerWidth != border.Width || outerHeight != border.Height ||
                           thickness != border.Thickness || border.StyleVersion != StyleVersion;
        if (sizeChanged)
        {
            if (!Render(border, outerWidth, outerHeight, thickness, x, y)) return;
            border.Width = outerWidth;
            border.Height = outerHeight;
            border.Thickness = thickness;
            border.StyleVersion = StyleVersion;
            border.Shown = true;
        }
        else if (!border.Shown)
        {
            ShowWindow(border.Hwnd, SW_SHOWNOACTIVATE);
            border.Shown = true;
        }

        SetWindowPos(border.Hwnd, HWND_TOPMOST, x, y, 0, 0,
            SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_NOOWNERZORDER | SWP_NOSENDCHANGING);
    }

    private static bool Render(BorderWindow border, int width, int height, int thickness, int x, int y)
    {
        if (width <= 0 || height <= 0) return false;
        try
        {
            using (Bitmap bitmap = new Bitmap(width, height, PixelFormat.Format32bppPArgb))
            using (Graphics graphics = Graphics.FromImage(bitmap))
            {
                graphics.SmoothingMode = SmoothingMode.AntiAlias;
                graphics.Clear(Color.Transparent);
                float half = thickness / 2f;
                RectangleF rect = new RectangleF(half, half, width - thickness, height - thickness);
                float radius = Rounded ? Math.Max(6f, thickness * 2.5f) : 0f;
                if (radius > 0f) radius = Math.Max(0f, radius - half);
                using (GraphicsPath path = RoundedRectangle(rect, radius))
                using (Pen pen = new Pen(Color.FromArgb((int)Math.Round(Opacity * 255 / 100.0), ColorR, ColorG, ColorB), thickness))
                {
                    pen.LineJoin = LineJoin.Round;
                    graphics.DrawPath(pen, path);
                }
                return ApplyBitmap(border.Hwnd, bitmap, width, height, x, y);
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("render failed: " + error.Message);
            return false;
        }
    }

    private static GraphicsPath RoundedRectangle(RectangleF rect, float radius)
    {
        GraphicsPath path = new GraphicsPath();
        if (radius <= 0.5f)
        {
            path.AddRectangle(rect);
            return path;
        }
        float diameter = radius * 2f;
        path.AddArc(rect.X, rect.Y, diameter, diameter, 180f, 90f);
        path.AddArc(rect.Right - diameter, rect.Y, diameter, diameter, 270f, 90f);
        path.AddArc(rect.Right - diameter, rect.Bottom - diameter, diameter, diameter, 0f, 90f);
        path.AddArc(rect.X, rect.Bottom - diameter, diameter, diameter, 90f, 90f);
        path.CloseFigure();
        return path;
    }

    private static bool ApplyBitmap(IntPtr hwnd, Bitmap bitmap, int width, int height, int x, int y)
    {
        IntPtr screenDc = GetDC(IntPtr.Zero);
        IntPtr memoryDc = CreateCompatibleDC(screenDc);
        IntPtr hBitmap = bitmap.GetHbitmap(Color.FromArgb(0));
        IntPtr previous = SelectObject(memoryDc, hBitmap);
        try
        {
            POINT destination = new POINT { X = x, Y = y };
            SIZE size = new SIZE { cx = width, cy = height };
            POINT source = new POINT { X = 0, Y = 0 };
            BLENDFUNCTION blend = new BLENDFUNCTION
            {
                BlendOp = 0,
                BlendFlags = 0,
                SourceConstantAlpha = 255,
                AlphaFormat = 1
            };
            bool updated = UpdateLayeredWindow(hwnd, screenDc, ref destination, ref size, memoryDc, ref source, 0, ref blend, ULW_ALPHA);
            if (updated) ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            return updated;
        }
        finally
        {
            SelectObject(memoryDc, previous);
            DeleteObject(hBitmap);
            DeleteDC(memoryDc);
            ReleaseDC(IntPtr.Zero, screenDc);
        }
    }
}
'@ -ReferencedAssemblies System.Drawing

[TabDoPinBorder]::Run()
