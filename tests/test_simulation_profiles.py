"""Tests for simulation capability profiles."""

from __future__ import annotations

import pytest

from roboclaw.embodied.simulation.profiles import DEFAULT_PROFILE, get_profile


def test_get_profile_defaults_only_when_profile_id_is_none() -> None:
    assert get_profile(None) is DEFAULT_PROFILE


def test_get_profile_rejects_empty_string() -> None:
    with pytest.raises(ValueError, match="Unknown simulation profile ''"):
        get_profile("")
