# dfgtec Pinewood Derby Timer (PDT)

## Identification

The pack's September 10, 2026 photos strongly match David Gadberry's dfgtec PDT: an Arduino Uno, a purple PDT shield with six lane connections and a blue display dimmer, and three Adafruit 1.2-inch HT16K33 display backpacks in a custom aluminum finish bridge. Arduino and Adafruit identify components; dfgtec identifies the timer design. The photos do not establish the track manufacturer or installed firmware version.

Sources: [PDT project](https://www.dfgtec.com/pdt), [construction photographs](https://www.dfgtec.com/pdt-construction), [software configuration](https://www.dfgtec.com/pdt-software), and [published firmware 3.10](https://www.dfgtec.com/download/timer.ino). Implementation follows the published wire protocol; firmware source is not bundled.

## Connecting the pack's timer

Use the Uno's USB-B socket with a USB data cable and retain the existing external power supply for the displays. Select **dfgtec Pinewood Derby Timer (PDT)** and its COM port in Timer Settings. Set up a three-lane race and verify physical lane mapping 1–3.

Connect while the timer is idle. PackRacer waits 2.5 seconds for the Uno's possible USB-open reset, then verifies the version response. Select PDT explicitly: generic auto-detection sends other manufacturers' commands which overlap PDT reset commands.

Close the start gate before **Arm Current Heat**. Arming clears lane masks, masks unoccupied lanes, and resets the timer for the next run. If diagnostics report an open gate, close it, reset, and arm again. Start manually unless this particular track has the optional solenoid circuit installed and tested. Release Gate is available only after arming a supported timer.

## Implemented protocol

9600 baud, 8 data bits, no parity, 1 stop bit. Commands are uppercase ASCII; PackRacer's trailing CR is ignored by the firmware. Commands are paced at 150 ms because mask/reset handling pauses for 100 ms.

| Operation | Command / response |
|---|---|
| Verify | `V` → `vert=3.10` (version may vary) |
| Prepare heat | `U`, then `M1`–`M6` for unused lanes, then `R` |
| Reset | `R`; requires closed gate, `K` indicates ready, `O` indicates open gate |
| Race start | Incoming `B` |
| Force unfinished race to end | `F` |
| Optional solenoid release | `S` |
| Lane result | `1 - 3.0123` followed by CRLF |
| Unfinished/masked lane | `3 - 99.9990` |

Results carry numeric lanes and seconds with four decimals, with no transmitted places or end marker. The parser preserves 0.1 ms precision. Completion requires all occupied mapped lanes; equal times remain ties. The exact `99.9990` sentinel becomes DNF for an occupied lane. Masked/unexpected lane records are ignored by capture handling. Partial or malformed records never supply invented times. `Q` (resend), `G` (gate query), `N` (lane count), and `I` (information) exist in firmware but are not exposed as operator commands.

## Validation

Protocol implemented; real hardware validation pending. A fragmented replay and virtual simulator cover PDT framing, start, DNF, and close times. The simulator is not a firmware emulator and does not validate electrical timing or gate acknowledgements.

Before race day, connect the actual unit, record its version response, run each lane and a full three-car heat, compare displayed and captured results, repeat with an empty lane and forced DNF, and verify reset/reconnect behavior. Custom or older firmware must be checked against the observed serial transcript. Do not reflash the working timer merely to identify it.
