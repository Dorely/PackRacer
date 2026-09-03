# The Judge Protocol

## Sources and Confidence

- Primary sources: [The Judge options and Computer Option output](https://www.newdirections.ws/options.htm), [installation instructions](https://www.newdirections.ws/ij.html), and [manufacturer troubleshooting/serial settings](https://www.newdirections.ws/judgetrouble.html).
- Reviewed: 2026-09-03.
- PackRacer status: protocol implemented; physical hardware validation pending.

The manufacturer documents RS-232 output, 9600 8N1 settings, startup/status text, race output, automatic reset behavior, and computer-controlled reset capability. It does not publish a complete command table. The `*` behavior below is therefore retained as an implementation assumption that must be verified on hardware.

## Serial Configuration

- 9600 baud.
- 8 data bits.
- No parity.
- 1 stop bit.
- Flow control is not significant according to the manufacturer troubleshooting page.
- Nine-pin serial connection, optionally through USB-to-serial.

## Connection Verification and Commands

| Command | Implemented purpose | Confidence |
|---|---|---|
| `*` | Request/force output; accept response containing `Checking Valid Lanes` or `Number of Lanes` | Existing adapter behavior; public manufacturer pages show these response strings but do not publish the command byte |

PackRacer sends `*` followed by carriage return and requires one of those status strings before reporting ready. The same command is currently used by Force Results. Reset is not exposed until a manufacturer-supported command is confirmed.

The manufacturer says a Computer Option Judge can be reset by a computer, but the public page does not disclose that command.

## Startup and Race Output

The manufacturer shows a startup/result transcript containing:

```text
Race Number 14
Checking valid lanes.......
Number of Lanes: 6
Ready to Start Race
GO!
Lane 3 3.2437 Seconds
...
Race Over
```

PackRacer accepts `Go` or `Go!` as race start, `Lane N time` records as seconds, an optional `DNF` suffix, and text containing `Race Over` as completion. Input is carriage-return framed and may arrive in fragmented chunks.

The exact placement of lane and time text in the public webpage is visually tabular, so the parser's single-line `Lane N time` assumption requires a raw capture from an actual Computer Option unit. An explicit `DNF` suffix is also an implementation allowance, not a token confirmed by the public manufacturer page.

## Simulator Behavior

The virtual timer answers `*` with the documented valid-lane/status phrases, then emits fragmented `Go!`, lane/time, and `Race Over` records through the real Judge parser.

## Hardware Validation Needed

- Verify that `*` safely requests status and/or results and does not have model-specific side effects.
- Record power-up, ready, race start, lane result, timeout/DNF, race end, and reset messages byte-for-byte.
- Confirm line endings and whether `Lane N` and its time share one physical line.
- Obtain and document the manufacturer-supported computer reset command.
