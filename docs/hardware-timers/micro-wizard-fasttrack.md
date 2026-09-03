# Micro Wizard FastTrack K/Q Protocol

## Sources and Confidence

- Primary source: [Micro Wizard K3 Grand Prix instructions and serial command reference](https://cdn.shopify.com/s/files/1/0788/7562/3729/files/K3_grand_prix_instructions.pdf?v=1703017627).
- Product context: [Micro Wizard Q Series timer](https://microwizard.com/products/q-series-pinewood-derby-timer).
- Reviewed: 2026-09-03.
- PackRacer status: protocol implemented; physical hardware validation pending.

The command reference explicitly documents the commands and result formats below. It tells FUNterm users to retain the timer's default communication settings but does not print those values. PackRacer currently uses the commonly documented 9600 baud, 8 data bits, no parity, 1 stop bit configuration; that serial setting still requires confirmation against a physical K/Q unit.

## Connection Verification

PackRacer sends `RV` followed by carriage return and requires a response containing `Micro Wizard` or `Model: Q` before reporting the timer ready. The manufacturer says `RV` returns firmware version and serial number and recommends it as the communication test in FUNterm.

## Commands

| Command | Manufacturer meaning | PackRacer use |
|---|---|---|
| `RV` | Return firmware version and serial number | Connection probe |
| `RE` | Leave Eliminator mode and restore standard racing | Connection setup |
| `RF` | Return eight feature bits | Not currently used |
| `RS` | Return serial number | Not currently used |
| `M[A-G]` | Mask a lane; `MG` clears the mask and enables all lanes | Arm-time lane mask |
| `RL[0-N]` | Configure lane/data-stream reversal | Not currently used; PackRacer maps lanes in software |
| `RA` | End the race and return results from lanes that finished | Force Results |
| `LR` | Reset the laser gate; may also act like force results on appropriate hardware | Reset |
| `LE` | Enter Eliminator mode | Not used |
| `LF...` | Password-protected feature loading | Never used |
| `N0` | Old race-data format | Not used |
| `N1` | New race-data format with finish-place punctuation | Connection setup |
| `N2` | Five-digit time/start-switch status on 2012-and-newer timers | Connection setup |
| `RM` | Return lane count, mask, reversal, eliminator, and format modes | Not currently used |
| `RG` | Return start-switch state (`1` closed, `0` open) | Parser accepts `RG0`/`0` as race start |
| `LO` | Turn off laser/gate-release bit | Not used |
| `LN` | Turn on laser bit and open motor gate | Not used |
| `LG` | Pulse laser bit for solenoid gate release | Software gate release, behind acknowledgement and arm safety |
| `RX` | Simulate closing the start switch; ends a race when Force Print is available | Not used |
| `LX...` | Model-dependent automatic reset or display-cycle setting | Not used |

Commands are terminated with carriage return. A literal space is not used by this profile.

## Result Format

The configured `N1` format is a whitespace-separated sequence of letter-lane records:

```text
A=3.001! B=3.002" C=3.003# D=3.004$ E=3.005% F=3.006&\r\n
```

Lane `A` maps to physical lane 1, `B` to lane 2, and so on. Times are seconds. Finish punctuation is ASCII `!` first, `"` second, `#` third, `$` fourth, `%` fifth, and `&` sixth. PackRacer accepts fragmented records and either CR, LF, or CRLF framing.

The public command reference does not define an explicit DNF token. A missing lane therefore remains incomplete for operator resolution.

## Simulator Behavior

The virtual timer answers `RV` with a Micro Wizard/Q identity, accepts the same setup, mask, reset, force, and gate commands in its transcript, and emits fragmented `RG0` plus `N1` lane records through the physical parser.

## Hardware Validation Needed

- Confirm 9600 8N1 on current K and Q firmware.
- Record exact `RV` output for K-series and Q-series units.
- Confirm whether `N2` is accepted or should be conditional on firmware age.
- Verify mask command timing, `RA`, `LR`, and both motor/solenoid gate variants.
- Capture complete, incomplete, duplicate, and noise-contaminated transmissions.
