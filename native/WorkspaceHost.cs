using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Web.Script.Serialization;

internal static class WorkspaceHost
{
    [StructLayout(LayoutKind.Sequential)] private struct BasicLimits {
        public long ProcessTime, JobTime; public uint Flags; public UIntPtr MinWorking, MaxWorking;
        public uint ActiveProcesses; public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] private struct IoCounters { public ulong A, B, C, D, E, F; }
    [StructLayout(LayoutKind.Sequential)] private struct ExtendedLimits {
        public BasicLimits Basic; public IoCounters Io; public UIntPtr ProcessMemory, JobMemory, PeakProcess, PeakJob;
    }
    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetInformationJobObject(IntPtr job, int type, ref ExtendedLimits limits, uint size);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem {
        void BindToHandler(IntPtr a, ref Guid b, ref Guid c, out IntPtr d);
        void GetParent(out IShellItem value);
        void GetDisplayName(uint kind, out IntPtr value);
        void GetAttributes(uint mask, out uint value);
        void Compare(IShellItem other, uint hint, out int order);
    }
    [ComImport, Guid("947AAB5F-0A5C-4C13-B4D6-4BF7836FC9F8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileOperation {
        [PreserveSig] int Advise(IntPtr sink, out uint cookie);
        [PreserveSig] int Unadvise(uint cookie);
        [PreserveSig] int SetOperationFlags(uint flags);
        [PreserveSig] int SetProgressMessage([MarshalAs(UnmanagedType.LPWStr)] string message);
        [PreserveSig] int SetProgressDialog(IntPtr dialog);
        [PreserveSig] int SetProperties(IntPtr properties);
        [PreserveSig] int SetOwnerWindow(IntPtr owner);
        [PreserveSig] int ApplyPropertiesToItem(IntPtr item);
        [PreserveSig] int ApplyPropertiesToItems(IntPtr items);
        [PreserveSig] int RenameItem(IntPtr item, string name, IntPtr sink);
        [PreserveSig] int RenameItems(IntPtr items, string name);
        [PreserveSig] int MoveItem(IntPtr item, IntPtr target, string name, IntPtr sink);
        [PreserveSig] int MoveItems(IntPtr items, IntPtr target);
        [PreserveSig] int CopyItem(IntPtr item, IntPtr target, string name, IntPtr sink);
        [PreserveSig] int CopyItems(IntPtr items, IntPtr target);
        [PreserveSig] int DeleteItem(IShellItem item, IFileOperationProgressSink sink);
        [PreserveSig] int DeleteItems(IntPtr items);
        [PreserveSig] int NewItem(IntPtr target, uint attributes, string name, string template, IntPtr sink);
        [PreserveSig] int PerformOperations();
        [PreserveSig] int GetAnyOperationsAborted([MarshalAs(UnmanagedType.Bool)] out bool aborted);
    }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
    private static extern int SHCreateItemFromParsingName(string name, IntPtr bind, ref Guid id, out IShellItem item);

    [ComVisible(true), Guid("04B0F1A7-9490-44BC-96E1-4296A31252E2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileOperationProgressSink {
        [PreserveSig] int StartOperations();
        [PreserveSig] int FinishOperations(int result);
        [PreserveSig] int PreRenameItem(uint flags, IShellItem item, [MarshalAs(UnmanagedType.LPWStr)] string name);
        [PreserveSig] int PostRenameItem(uint flags, IShellItem item, [MarshalAs(UnmanagedType.LPWStr)] string name, int result, IShellItem created);
        [PreserveSig] int PreMoveItem(uint flags, IShellItem item, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name);
        [PreserveSig] int PostMoveItem(uint flags, IShellItem item, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name, int result, IShellItem created);
        [PreserveSig] int PreCopyItem(uint flags, IShellItem item, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name);
        [PreserveSig] int PostCopyItem(uint flags, IShellItem item, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name, int result, IShellItem created);
        [PreserveSig] int PreDeleteItem(uint flags, IShellItem item);
        [PreserveSig] int PostDeleteItem(uint flags, IShellItem item, int result, IShellItem created);
        [PreserveSig] int PreNewItem(uint flags, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name);
        [PreserveSig] int PostNewItem(uint flags, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.LPWStr)] string template, uint attributes, int result, IShellItem created);
        [PreserveSig] int UpdateProgress(uint total, uint completed);
        [PreserveSig] int ResetTimer();
        [PreserveSig] int PauseTimer();
        [PreserveSig] int ResumeTimer();
    }
    [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
    private sealed class RecycleSink : IFileOperationProgressSink {
        public bool Recycled;
        public int StartOperations() { return 0; }
        public int FinishOperations(int result) { return 0; }
        public int PreRenameItem(uint f, IShellItem i, string n) { return 0; }
        public int PostRenameItem(uint f, IShellItem i, string n, int r, IShellItem c) { return 0; }
        public int PreMoveItem(uint f, IShellItem i, IShellItem d, string n) { return 0; }
        public int PostMoveItem(uint f, IShellItem i, IShellItem d, string n, int r, IShellItem c) { return 0; }
        public int PreCopyItem(uint f, IShellItem i, IShellItem d, string n) { return 0; }
        public int PostCopyItem(uint f, IShellItem i, IShellItem d, string n, int r, IShellItem c) { return 0; }
        public int PreDeleteItem(uint flags, IShellItem item) { return (flags & 0x80) != 0 ? 0 : unchecked((int)0x80004004); }
        public int PostDeleteItem(uint flags, IShellItem item, int result, IShellItem created) { Recycled = result >= 0 && created != null; return 0; }
        public int PreNewItem(uint f, IShellItem d, string n) { return 0; }
        public int PostNewItem(uint f, IShellItem d, string n, string t, uint a, int r, IShellItem c) { return 0; }
        public int UpdateProgress(uint total, uint completed) { return 0; }
        public int ResetTimer() { return 0; }
        public int PauseTimer() { return 0; }
        public int ResumeTimer() { return 0; }
    }

    private static int Recycle(string target) {
        IShellItem item = null; IFileOperation operation = null;
        try {
            var id = typeof(IShellItem).GUID;
            Marshal.ThrowExceptionForHR(SHCreateItemFromParsingName(target, IntPtr.Zero, ref id, out item));
            operation = (IFileOperation)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("3AD05575-8857-4850-9277-11B85BDB8E09")));
            // Record undo, request recycling, and abort if Windows offers a permanent delete.
            var sink = new RecycleSink();
            Marshal.ThrowExceptionForHR(operation.SetOperationFlags(0x20000000 | 0x00080000 | 0x00100000 | 0x00002000 | 0x00000400 | 0x00000010 | 0x00000004));
            Marshal.ThrowExceptionForHR(operation.DeleteItem(item, sink));
            Marshal.ThrowExceptionForHR(operation.PerformOperations());
            bool aborted; Marshal.ThrowExceptionForHR(operation.GetAnyOperationsAborted(out aborted));
            if (aborted || !sink.Recycled || File.Exists(target) || Directory.Exists(target)) throw new IOException("Recycle operation did not complete; permanent deletion is not allowed.");
            return 0;
        } finally {
            if (item != null) Marshal.FinalReleaseComObject(item);
            if (operation != null) Marshal.FinalReleaseComObject(operation);
        }
    }
    private static int Run(Dictionary<string, object> request) {
        var job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) throw new System.ComponentModel.Win32Exception();
        var limits = new ExtendedLimits(); limits.Basic.Flags = 0x00002000;
        if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits)) || !AssignProcessToJobObject(job, Process.GetCurrentProcess().Handle))
            throw new System.ComponentModel.Win32Exception();
        // The helper owns the job handle until process exit; its descendants cannot outlive it.
        var parent = Process.GetProcessById(Convert.ToInt32(request["parent_pid"]));
        var watcher = new Thread(() => { try { parent.WaitForExit(); Environment.Exit(130); } catch { Environment.Exit(130); } });
        watcher.IsBackground = true; watcher.Start();
        string script = "$ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false); $OutputEncoding = [Console]::OutputEncoding; $ErrorActionPreference='Stop'; $global:LASTEXITCODE=0;\ntry { & {\n" + Convert.ToString(request["command"]) +
            "\n}; $argonOk=$?; if ($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}; if (!$argonOk) {exit 1} } catch { [Console]::Error.WriteLine($_.ToString()); exit 1 }";
        var shell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell\\v1.0\\powershell.exe");
        var info = new ProcessStartInfo(shell, "-NoLogo -NoProfile -NonInteractive -OutputFormat Text -ExecutionPolicy Bypass -EncodedCommand " + Convert.ToBase64String(Encoding.Unicode.GetBytes(script)));
        info.UseShellExecute = false; info.CreateNoWindow = true; info.WorkingDirectory = Convert.ToString(request["cwd"]);
        info.RedirectStandardOutput = true; info.RedirectStandardError = true;
        using (var process = Process.Start(info)) {
            var output = new Thread(() => { try { process.StandardOutput.BaseStream.CopyTo(Console.OpenStandardOutput()); } catch { } });
            var error = new Thread(() => { try { process.StandardError.BaseStream.CopyTo(Console.OpenStandardError()); } catch { } });
            output.IsBackground = true; error.IsBackground = true; output.Start(); error.Start();
            process.WaitForExit(); output.Join(1000); error.Join(1000); return process.ExitCode;
        }
    }
    [STAThread] private static int Main(string[] args) {
        Console.InputEncoding = new UTF8Encoding(false); Console.OutputEncoding = new UTF8Encoding(false);
        try {
            var json = new JavaScriptSerializer { MaxJsonLength = 65536 };
            var request = json.Deserialize<Dictionary<string, object>>(Console.In.ReadToEnd());
            if (args.Length == 1 && args[0] == "trash") return Recycle(Convert.ToString(request["path"]));
            if (args.Length == 1 && args[0] == "run") return Run(request);
            throw new ArgumentException("Unsupported helper operation.");
        } catch (Exception error) { Console.Error.WriteLine("ARGONDESK_HOST: " + error.Message); return 1; }
    }
}
