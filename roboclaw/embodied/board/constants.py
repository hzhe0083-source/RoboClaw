"""Constants for session state, commands, and episode phases."""

from enum import StrEnum


class SessionState(StrEnum):
    IDLE = "idle"
    PREPARING = "preparing"
    TELEOPERATING = "teleoperating"
    RECORDING = "recording"
    REPLAYING = "replaying"
    INFERRING = "inferring"
    ERROR = "error"


class Command(StrEnum):
    SAVE_EPISODE = "save_episode"
    DISCARD_EPISODE = "discard_episode"
    SKIP_RESET = "skip_reset"
    STOP = "stop"
    CONFIRM = "confirm"


class EpisodePhase(StrEnum):
    RECORDING = "recording"
    SAVING = "saving"
    RESETTING = "resetting"
    STOPPING = "stopping"
    DISCARDING = "discarding"
