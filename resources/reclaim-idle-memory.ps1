# Only the owning application supplies targets, after its windows and tasks have exited.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class TabDoIdleWorkingSet {
    /**
     * Open a process handle with only query and quota rights.
     * @param access Required Windows access mask.
     * @param inherit Whether children inherit the handle.
     * @param processId Exact process identity supplied by the owner.
     * @returns A handle or zero when access fails.
     */
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inherit, int processId);
    /**
     * Release a process handle after validation or reclamation.
     * @param handle The handle opened for this target.
     * @returns Whether Windows closed the handle.
     */
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);
    /**
     * Query creation identity through the already opened process handle.
     * @param handle Target process handle.
     * @param created Receives creation FILETIME.
     * @param exited Receives exit FILETIME.
     * @param kernel Receives kernel execution time.
     * @param user Receives user execution time.
     * @returns Whether the identity query succeeded.
     */
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetProcessTimes(IntPtr handle, out long created, out long exited, out long kernel, out long user);
    /**
     * Return cold resident pages without terminating a process or changing its limits.
     * @param handle The validated owned process handle.
     * @returns Whether Windows accepted the request.
     */
    [DllImport("psapi.dll", SetLastError = true)]
    private static extern bool EmptyWorkingSet(IntPtr handle);

    /**
     * Validate creation time before returning an owned process's cold working set.
     * @param processId Current Electron process identifier.
     * @param expectedCreationTime Creation timestamp in Unix milliseconds.
     * @returns Whether validation and the Windows reclamation request succeeded.
     */
    public static bool Release(int processId, double expectedCreationTime) {
        if (processId <= 0 || expectedCreationTime <= 0 || Double.IsNaN(expectedCreationTime) || Double.IsInfinity(expectedCreationTime)) return false;
        // Keep one handle across identity validation and reclamation to prevent PID reuse.
        IntPtr handle = OpenProcess(0x1000 | 0x0100, false, processId);
        if (handle == IntPtr.Zero) return false;
        try {
            long created, exited, kernel, user;
            if (!GetProcessTimes(handle, out created, out exited, out kernel, out user)) return false;
            double actual = (DateTime.FromFileTimeUtc(created) - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
            if (Math.Abs(actual - expectedCreationTime) > 2) return false;
            return EmptyWorkingSet(handle);
        } finally {
            CloseHandle(handle);
        }
    }
}
'@
[Console]::WriteLine('ready')
$targets = [Console]::ReadLine() | ConvertFrom-Json
$released = 0
foreach ($target in $targets) {
    # Only validated handles are affected; never terminate a target or apply persistent limits.
    if ([TabDoIdleWorkingSet]::Release([int]$target.pid, [double]$target.creationTime)) {
        $released++
    }
}
[Console]::WriteLine(('released:{0}/{1}' -f $released, @($targets).Count))
