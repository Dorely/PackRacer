# Hardware Timers

PackRacer can use a serial hardware timer or its built-in simulator as an optional Race Control input. Manual result entry remains available in every timer state. A timer capture is always staged in the normal result form for review; it never saves a result or advances a heat automatically.

## Platform Support

| Platform | Status |
|---|---|
| Windows x64 | Supported initial platform |
| Windows ARM | Planned; unvalidated |
| macOS | Planned; unvalidated |
| Linux | Planned; unvalidated |

Serial access uses [`serialport@13`](https://serialport.io/docs/next/guide-platform-support/). Every physical profile is currently marked **protocol implemented, hardware validation pending** until it is exercised with a real timer.

## Operator Workflow

1. Open **Race Control → Hardware Timer**.
2. Select a profile and COM port, then choose **Connect**. PackRacer never auto-connects at startup.
3. Confirm the physical-to-PackRacer lane mapping.
4. Select the current heat and choose **Arm Current Heat**.
5. Run the physical race, or use a supported software gate-release control.
6. Review the staged values in the ordinary result form. Warnings, missing lanes, DNF values, and unresolved ties remain visible and editable.
7. Explicitly choose **Accept Capture And Advance**, or discard the capture and use manual entry.

The main process validates the capture ID, current event, race, heat, lane assignments, disabled lanes, and arm snapshot before persistence. The capture is consumed only after the result and its audit entry are successfully stored.

## Supported Profiles and Protocol Notes

Hardware-specific findings, exact implemented commands, public-source support, unknowns, and hardware-validation status are maintained separately:

| Profile | Protocol notes |
|---|---|
| Micro Wizard FastTrack K/Q | [Micro Wizard protocol](hardware-timers/micro-wizard-fasttrack.md) |
| BestTrack / SmartLine Champ and Champ SRM | [BestTrack Champ protocols](hardware-timers/besttrack-champ.md) |
| NewBold DT / TURBO / DerbyStick | [NewBold protocol](hardware-timers/newbold.md) |
| The Judge | [The Judge protocol](hardware-timers/the-judge.md) |

### Advanced Serial Timer

Advanced mode is declarative. It supports serial parameters, line endings, numeric or letter lanes, seconds or milliseconds, three fixed record layouts, a literal completion marker, and optional static probe/setup/reset/force/release commands. It does not execute scripts and does not accept unrestricted regular expressions.

An advanced release command is subject to the same saved safety acknowledgement and one-release-per-arm protection as built-in hardware profiles.

## Lane Mapping and Capture Rules

- The default mapping is identity: physical lane 1 maps to PackRacer lane 1.
- Every occupied PackRacer lane must have exactly one physical lane mapping when the heat is armed.
- Results for empty or unexpected lanes are ignored and logged as warnings.
- Fragmented serial chunks are buffered until a line ending; oversized unterminated frames are discarded with a diagnostic warning.
- Repeated lane records are deduplicated. A changed retransmission replaces the earlier staged value and creates a warning.
- Positions are derived from times only when the order is unambiguous. Exact ties remain unresolved for the operator.
- An explicit DNF is preserved. Missing lanes remain missing so the operator can resolve them.
- Changing events or current heats disarms the timer and makes an outstanding capture ineligible for acceptance.

The rolling diagnostic transcript contains sent commands, escaped received chunks, parser warnings, state changes, and discarded/stale activity. Serial handles never cross the preload bridge.

## Gate Release Safety

Software gate control is off by default and stored as a computer/track preference rather than event data. The operator must save the acknowledgement before the control is enabled.

A release is allowed only when the connected profile declares support, the current heat is armed, the acknowledgement is enabled, and no release has been sent for that arm operation. Exactly one command is sent. Disconnection, disarming, changing heat, receiving a result, or an error disables release. A release failure does not affect manual entry.

The initial built-in physical release implementation is limited to documented Micro Wizard K/Q automatic-gate hardware. Advanced profiles may define a static release command. No generic or inferred physical gate release exists.

## Simulator

Choose **Open Timer Simulator** in Race Control. The separate simulator window activates a virtual `PACKRACER-SIM` port. Closing the window removes that port and drops an active connection.

The simulator is not a timer profile. Select the physical hardware model it should emulate in the simulator window, then choose the same physical profile and the scanned `PACKRACER-SIM` port in Race Control. Connection probing, setup commands, fragmented ASCII input, the physical adapter parser, arm snapshot, normalization, staging, persistence, and auditing all follow the hardware path.

Normal use is:

1. Open the Timer Simulator and select the hardware model to emulate.
2. Scan ports in Race Control.
3. Select the matching hardware profile and `PACKRACER-SIM`, then connect.
4. Arm the current heat in Race Control.
5. Choose **Send Simulated Heat** in the simulator window.
6. Observe the raw-byte transcript and staged capture.
7. Review or edit the result, then confirm every simulated acceptance or discard it.

The simulator also accepts manually entered ASCII with `\\r` and `\\n` escapes. This is useful for exercising malformed, partial, or model-specific messages through the connected adapter.

Times are reproducible from the heat ID, scenario, and session-only variation number. The same heat and variation produces the same ordering and approximately three-second times. **New variation** changes the deterministic input without persisting that diagnostic choice into a future app session.

Scenarios:

- **Normal finish** — all occupied lanes receive unique times and places.
- **Close finish** — valid times differ by only a few milliseconds.
- **Exact tie** — two lanes share a time; profiles that transmit authoritative order retain that order.
- **Explicit DNF** — one occupied lane uses the profile's documented DNF/timeout representation; profiles without one leave that lane missing.
- **Incomplete result** — one occupied lane never reports. A profile with an end marker stages an incomplete capture; other profiles remain armed until **Force Results** or operator recovery.
- **Duplicate transmission** — the completed result is emitted twice to exercise deduplication.
- **Disconnect during heat** — the connection fails between start and result.

Reset and gate-release commands are sent to the virtual device and appear in its transcript. Force Results stages only lane values already received. Simulated results may be stored for rehearsal, but every acceptance requires confirmation and is audited as simulated.

## Raw Protocol Replay

The diagnostics section can replay bundled byte transcripts through the real parser for each physical profile without opening a COM port. Fixtures include fragmented chunks and representative protocol framing so parser output can be inspected as normalized events before real hardware is available.

## Stored Preferences

The following app-local values are stored in SQLite metadata and are not added to `RaceEvent`:

- Last physical timer profile.
- Last COM-port hint and stable USB identity when the driver exposes one.
- Physical lane mapping.
- Advanced declarative profile.
- Software gate-control acknowledgement.

Simulator model, scenario, variation, and transcript are session-only. PackRacer never auto-connects.

## Hardware Validation Checklist

Before removing the validation-pending label for a unit, verify on Windows x64:

- COM-port enumeration and stable USB identity.
- Connect, disconnect, USB removal, and reconnection.
- Probe/detection behavior where supported.
- Whole, fragmented, noisy, duplicate, partial, and malformed transmissions.
- Lane masks, reset, and force-result behavior where supported.
- Remembered profile, port hint, mapping, advanced settings, and gate acknowledgement after restart.
- Gate release is unavailable when unsupported, disconnected, unarmed, stale, already released, or disabled.
- Manual entry remains usable during every timer and simulator state.
