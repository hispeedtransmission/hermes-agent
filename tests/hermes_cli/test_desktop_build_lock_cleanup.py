"""Every Desktop preflight exit releases both checkout and build custody."""

import argparse
from pathlib import Path
import subprocess
import sys

import pytest

from hermes_cli import main, main_desktop, source_build
from hermes_cli.desktop_build_lock import DesktopBuildLock


@pytest.fixture
def desktop(tmp_path, monkeypatch):
    root = tmp_path / "checkout"
    app = root / "apps" / "desktop"
    app.mkdir(parents=True)
    (app / "package.json").write_text("{}", encoding="utf-8")
    monkeypatch.setattr(main, "PROJECT_ROOT", root)
    monkeypatch.setattr(main_desktop, "_desktop_launch_env", lambda _: ({}, []))
    monkeypatch.setattr(main_desktop, "_desktop_build_needed", lambda *a, **k: True)
    monkeypatch.setattr(main_desktop, "_register_linux_desktop_entry", lambda **k: None)
    monkeypatch.setattr(source_build, "source_build_env", lambda *a, **k: {"PATH": ""})
    monkeypatch.setattr(source_build, "prepare_source_dependencies", lambda *a, **k: None)
    monkeypatch.setattr(main_desktop, "build_prepared_desktop", lambda *a, **k: None)
    return root


def _assert_custody_released(root):
    # A same-process reacquire could join a leaked checkout hold. An independent
    # child proves both kernel locks are free, not just the narrow build lock.
    probe = (
        "import sys\nfrom pathlib import Path\n"
        "from hermes_cli.desktop_build_lock import DesktopBuildLock\n"
        "lock = DesktopBuildLock(Path(sys.argv[1]))\n"
        "ok = lock.acquire()\nlock.release()\nraise SystemExit(0 if ok else 23)\n"
    )
    result = subprocess.run([sys.executable, "-c", probe, str(root)], check=False, timeout=30)
    assert result.returncode == 0, "preflight retained checkout/build custody"


@pytest.mark.parametrize("failure", ["freshness", "interrupt", "missing-artifact", "missing-runtime"])
def test_preflight_failure_releases_custody(desktop, monkeypatch, failure):
    from hermes_cli import update_lock

    args = argparse.Namespace(build_only=True, source=False)
    if failure == "freshness":
        def fail(*a, **k):
            raise OSError("unreadable build receipt")
        monkeypatch.setattr(main_desktop, "_desktop_build_needed", fail)
    elif failure == "interrupt":
        def fail(*a, **k):
            raise KeyboardInterrupt
        monkeypatch.setattr(main_desktop, "build_prepared_desktop", fail)
    elif failure == "missing-runtime":
        args = argparse.Namespace(build_only=False, source=True)
    try:
        with pytest.raises((SystemExit, KeyboardInterrupt, OSError)):
            main_desktop.cmd_gui(args)
        _assert_custody_released(desktop)
        assert update_lock._HELD is None
    finally:
        # Keep a red run from poisoning sibling cases; never hide the assertion.
        while update_lock._HELD is not None:
            update_lock._release_checkout()


def test_build_lock_error_closes_its_descriptor(tmp_path, monkeypatch):
    import gateway.status

    lock = DesktopBuildLock(tmp_path)
    opened = []
    original = Path.open

    def track(path, *a, **k):
        handle = original(path, *a, **k)
        if path == lock.path:
            opened.append(handle)
        return handle

    def fail(_handle):
        raise OSError("locking unavailable")

    monkeypatch.setattr(Path, "open", track)
    monkeypatch.setattr(gateway.status, "_try_acquire_file_lock", fail)
    with pytest.raises(OSError, match="locking unavailable"):
        lock.acquire()
    assert opened and opened[0].closed
    _assert_custody_released(tmp_path)
