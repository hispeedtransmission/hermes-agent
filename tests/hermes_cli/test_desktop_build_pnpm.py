"""Source desktop builds honor the checkout's pnpm dependency owner."""
import os

import pytest


@pytest.mark.parametrize("source_mode", [True, False])
def test_desktop_pnpm_build_and_pack_keep_arguments(tmp_path, monkeypatch, source_mode):
    from hermes_cli import main_desktop, source_build

    desktop = tmp_path / "apps" / "desktop"
    desktop.mkdir(parents=True)
    (tmp_path / "pnpm-lock.yaml").write_text("lockfileVersion: '9.0'\n")
    calls = []
    monkeypatch.setattr(main_desktop.shutil, "which", lambda name, **_: f"/tools/{name}")
    monkeypatch.setattr(main_desktop, "_force_adhoc_macos_signing", lambda *_a, **_k: False)
    monkeypatch.setattr(main_desktop, "_desktop_staging_dir", lambda *_: tmp_path / "stage")
    monkeypatch.setattr(main_desktop, "_stop_desktop_processes_locking_build", lambda *_: [])
    monkeypatch.setattr(main_desktop, "_promote_staged_desktop_app", lambda *_: tmp_path / "Hermes")
    monkeypatch.setattr(main_desktop, "_discard_desktop_staging", lambda *_: None)
    monkeypatch.setattr(source_build, "run_in_custody", lambda _root, command, *_a, **_k: calls.append(command))
    main_desktop.build_prepared_desktop(desktop, source_mode=source_mode, npm="/tools/npm",
                                        env=dict(os.environ), icons=tmp_path)
    assert calls[0] == ["/tools/pnpm", "run", "build", "--icons", str(tmp_path)]
    if not source_mode:
        assert calls[1] == ["/tools/pnpm", "run", "builder", "--dir", "--publish", "never",
                            f"-c.directories.output={tmp_path / 'stage'}"]
