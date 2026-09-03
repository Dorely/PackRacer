# BestTrack Champ and SmartLine Protocols

## Sources and Confidence

- Primary sources: [current Champ Timer SS manual](https://www.besttrack.com/Champ%20Single%20Sided%20Timer%20Manual.pdf), [legacy/double-sided Champ manual](https://besttrack.com/Champ%20Timer%20Command%20Manual.pdf), and [BestTrack Champ product page](https://besttrack.com/champ_timer.htm).
- Reviewed: 2026-09-03.
- PackRacer status: protocol implemented; physical hardware validation pending.

BestTrack's public manuals confirm RS-232/USB-serial operation, computer connection mode, version display after successful setup-software communication, one to eight lanes, and result timing. The public manuals do not publish a byte-level command table. The exact command strings below are the existing PackRacer/eTek-compatible implementation assumptions and must be checked against real legacy and current units before the validation-pending label is removed.

## Shared Serial Configuration

PackRacer uses 9600 baud, 8 data bits, no parity, 1 stop bit, with commands terminated by carriage return. Both profiles require a version response before the connection becomes ready.

## Legacy SmartLine / Champ

### Connection and Commands

| Command | Implemented purpose | Confidence |
|---|---|---|
| `v` | Request version; expect text containing `eTekGadget SmartLine Timer` | Existing adapter behavior; public manual only confirms version-based connection feedback |
| `r` | Reset | Existing adapter behavior; hardware validation pending |
| `ol0` | Configure result/lane output | Existing adapter behavior; hardware validation pending |
| `op3` | Configure place/time output | Existing adapter behavior; hardware validation pending |
| `om0` | Clear lane mask | Existing adapter behavior; hardware validation pending |
| `omN` | Mask physical lane N | Existing adapter behavior; hardware validation pending |
| `rg` | Prepare/get next race | Existing adapter behavior; hardware validation pending |
| `ra` | Force available results | Existing adapter behavior; hardware validation pending |

PackRacer sends `v` and requires the eTek/SmartLine identity before it sends setup commands `r`, `ol0`, and `op3`.

### Result Format

Legacy results use letter lanes and Micro-Wizard-style place punctuation, framed by carriage return:

```text
S\r
A=3.011! B=3.022" C=3.105#\r
```

`S` is treated as race start. Letter lanes map A=1, B=2, and so on. Times are seconds. Place punctuation uses `!`, `"`, `#`, `$`, `%`, and `&` for places one through six.

## Current SRM Champ

### Connection and Commands

| Command | Implemented purpose | Confidence |
|---|---|---|
| `v` | Request version; expect text matching `SRM ... Enterprises` | Existing adapter behavior; current manual confirms back-and-forth connection mode but omits bytes |

No reset, mask, force-results, or software gate-release command is currently exposed for this profile. The current manual says software computer mode enables all lanes and no-timeout behavior, but does not publish how GPRM negotiates that mode.

### Result Format

Current SRM results use numeric lanes, carriage-return framing, and the same place punctuation:

```text
S\r
1=3.021! 2=3.044" 3=3.090#\r
```

## Simulator Behavior

The virtual timer responds to `v` with the identity for the selected legacy or SRM model. Selecting the wrong Champ profile therefore fails its handshake. Simulated race data is fragmented and sent as the profile's letter-lane or numeric-lane format through the real parser.

## Hardware Validation Needed

- Capture exact version responses from both generations.
- Confirm 9600 8N1 and command terminators.
- Verify every legacy setup, lane-mask, reset, prepare, and force command.
- Determine whether current SRM firmware exposes documented reset/mask/result-return commands.
- Capture start, complete, incomplete, duplicate, and timeout output from each generation.
