# Window helper for driving the Paradox launcher / CS2 from an agent.
#
#   win.ps1 list                                  windows of interest (process, title, rect)
#   win.ps1 shot  <proc> <out.png> [maxWidth]     focus <proc>'s main window, capture its client area
#   win.ps1 click <proc> <x> <y> [shotWidth]      left-click at (x,y) in screenshot coordinates
#   win.ps1 press <proc> <chord> [holdMs]         focus, then press a key chord ("ctrl+h", "esc", "enter")
#                                                 as scan codes - what the game's key bindings need
#   win.ps1 type  <proc> <text>                   focus, then type text (SendKeys syntax, so escape
#                                                 + ^ % ~ ( ) { }); reaches focused UI text fields only
#   win.ps1 invoke <proc> <name>                  click the control with that accessible name
#                                                 (UI Automation; works for the launcher, not the game)
#   win.ps1 close <proc>                          WM_CLOSE the main window (graceful)
#
# <proc> is a process name without .exe (Cities2, Paradox Launcher, ...).
# Screenshots are scaled down to maxWidth (default 1280) to keep them cheap to
# read; pass the same width to `click` so coordinates map back. Capture uses
# the screen, so the window is brought to the foreground first.
param([Parameter(Position = 0)][string]$cmd, [Parameter(ValueFromRemainingArguments = $true)][string[]]$rest)
$ErrorActionPreference = 'Stop'

Add-Type -ReferencedAssemblies System.Drawing, System.Windows.Forms -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class W {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern IntPtr PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);

  public static bool Focus(IntPtr h) {
    if (IsIconic(h)) ShowWindow(h, 9);
    for (int i = 0; i < 10; i++) {
      if (GetForegroundWindow() == h) return true;
      // A tapped Alt makes Windows accept SetForegroundWindow from a background process.
      keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero);
      SetForegroundWindow(h);
      System.Threading.Thread.Sleep(150);
    }
    return GetForegroundWindow() == h;
  }
  public static Rectangle Client(IntPtr h) {
    RECT r; GetClientRect(h, out r); POINT p = new POINT(); ClientToScreen(h, ref p);
    return new Rectangle(p.X, p.Y, r.R - r.L, r.B - r.T);
  }
  public static void Shot(Rectangle c, string path, int maxW) {
    using (var bmp = new Bitmap(c.Width, c.Height)) {
      using (var g = Graphics.FromImage(bmp)) g.CopyFromScreen(c.X, c.Y, 0, 0, c.Size);
      int w = Math.Min(maxW, c.Width), hh = (int)Math.Round(c.Height * (double)w / c.Width);
      using (var o = new Bitmap(bmp, w, hh)) o.Save(path, ImageFormat.Png);
    }
  }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk, scan; public uint flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit, Size = 40)] struct INPUT { [FieldOffset(0)] public uint type; [FieldOffset(8)] public KEYBDINPUT ki; }
  [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] i, int size);
  [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint type);
  static readonly int[] Extended = { 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2D, 0x2E, 0x5B, 0x6F, 0xA3, 0xA5 };
  // Unity's Input System reads raw input, which identifies keys by scan code;
  // SendKeys / keybd_event send scan code 0 and are ignored by the game.
  public static void Key(ushort vk, bool up) {
    var i = new INPUT { type = 1 };
    i.ki.scan = (ushort)MapVirtualKey(vk, 0);
    i.ki.flags = 0x8 | (up ? 0x2u : 0u) | (Array.IndexOf(Extended, (int)vk) >= 0 ? 0x1u : 0u);
    SendInput(1, new[] { i }, Marshal.SizeOf(typeof(INPUT)));
  }
  public static void Click(int x, int y) {
    SetCursorPos(x, y); System.Threading.Thread.Sleep(80);
    mouse_event(0x2, 0, 0, 0, UIntPtr.Zero); System.Threading.Thread.Sleep(60);
    mouse_event(0x4, 0, 0, 0, UIntPtr.Zero);
  }
}
'@
[void][W]::SetProcessDPIAware()

function Get-Win([string]$name) {
  $p = Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (-not $p) { throw "no window for process '$name'" }
  return $p.MainWindowHandle
}
function Focus-Win($h) { if (-not [W]::Focus($h)) { throw "could not bring window to the foreground" } }

switch ($cmd) {
  'list' {
    Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | ForEach-Object {
      $c = [W]::Client($_.MainWindowHandle)
      '{0,-28} {1,-40} {2},{3} {4}x{5}' -f $_.ProcessName, $_.MainWindowTitle, $c.X, $c.Y, $c.Width, $c.Height
    }
  }
  'shot' {
    $h = Get-Win $rest[0]; $max = if ($rest.Count -gt 2) { [int]$rest[2] } else { 1280 }
    Focus-Win $h; Start-Sleep -Milliseconds 250
    $c = [W]::Client($h); [W]::Shot($c, $rest[1], $max)
    "client {0}x{1} at {2},{3} -> {4}" -f $c.Width, $c.Height, $c.X, $c.Y, $rest[1]
  }
  'click' {
    $h = Get-Win $rest[0]; $shotW = if ($rest.Count -gt 3) { [int]$rest[3] } else { 1280 }
    Focus-Win $h; $c = [W]::Client($h); $s = $c.Width / [Math]::Min($shotW, $c.Width)
    $x = $c.X + [int]([double]$rest[1] * $s); $y = $c.Y + [int]([double]$rest[2] * $s)
    [W]::Click($x, $y); "clicked screen $x,$y"
  }
  'type' {
    $h = Get-Win $rest[0]; Focus-Win $h
    [System.Windows.Forms.SendKeys]::SendWait($rest[1]); "sent $($rest[1])"
  }
  'press' {
    $h = Get-Win $rest[0]; Focus-Win $h
    $hold = if ($rest.Count -gt 2) { [int]$rest[2] } else { 100 }
    $names = @{ ctrl = 0xA2; shift = 0xA0; alt = 0xA4; esc = 0x1B; escape = 0x1B; enter = 0x0D; tab = 0x09; space = 0x20;
      backspace = 0x08; delete = 0x2E; left = 0x25; up = 0x26; right = 0x27; down = 0x28; home = 0x24; end = 0x23; pageup = 0x21; pagedown = 0x22 }
    $vks = foreach ($k in $rest[1].ToLower().Split('+')) {
      if ($names.ContainsKey($k)) { $names[$k] }
      elseif ($k -match '^f(\d+)$') { 0x6F + [int]$Matches[1] }
      elseif ($k.Length -eq 1) { [int][char]$k.ToUpper() }
      else { throw "unknown key '$k'" }
    }
    foreach ($vk in $vks) { [W]::Key($vk, $false); Start-Sleep -Milliseconds 30 }
    Start-Sleep -Milliseconds $hold
    [array]::Reverse($vks); foreach ($vk in $vks) { [W]::Key($vk, $true); Start-Sleep -Milliseconds 30 }
    "pressed $($rest[1])"
  }
  'invoke' {
    # Find a control by its accessible name (exact, case-insensitive) and click its centre.
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
    $h = Get-Win $rest[0]
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($h)
    $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    $hit = $all | Where-Object { $_.Current.Name -and $_.Current.Name.Trim() -ieq $rest[1] -and -not $_.Current.IsOffscreen } |
      Sort-Object { $_.Current.ControlType.ProgrammaticName -ne 'ControlType.Button' } | Select-Object -First 1
    if (-not $hit) { throw "no element named '$($rest[1])'" }
    $r = $hit.Current.BoundingRectangle
    Focus-Win $h
    [W]::Click([int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2))
    "clicked '$($hit.Current.Name)' ($($hit.Current.ControlType.ProgrammaticName)) at $([int]($r.X + $r.Width / 2)),$([int]($r.Y + $r.Height / 2))"
  }
  'close' { $h = Get-Win $rest[0]; [void][W]::PostMessage($h, 0x10, [IntPtr]::Zero, [IntPtr]::Zero); "WM_CLOSE sent" }
  default { Get-Content $PSCommandPath -TotalCount 17 | Select-Object -Skip 1 }
}
