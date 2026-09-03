# NewBold DT / TURBO / DerbyStick Protocol

## Sources and Confidence

- Primary source: [NewBold DTX000 operating manual](https://newboldproducts.shoppingcartsplus.com/f/opmandtx_5.pdf).
- Reviewed: 2026-09-03.
- PackRacer status: protocol implemented; physical hardware validation pending.

The manual covers DT1000, DT2000, and DT8000 families and states that TURBO and DerbyStick naming may refer to the same product family.

## Serial Configuration

- 1200 baud.
- 7 data bits.
- No parity.
- 2 stop bits.
- Flow control off.
- Straight-through DB9 cable, optionally through a USB-to-serial adapter.
- 7-bit ASCII output.

The manual recommends connecting the computer before applying timer power so the computer receives initial information.

## Connection Verification and Reset

NewBold does not publish an identity-query command. It may emit a `DT1000`, `DT2000`, or `DT8000 NewBold Products` heading at startup or while displaying captured results. A space from the computer performs the same progression/reset action as the timer's RESET button.

For a physical port, PackRacer sends a space and waits for a NewBold heading or parseable lane/time output. If neither arrives, connection fails instead of treating an arbitrary open COM port as a timer. Operators may need to start Connect and then power-cycle the unit so its startup text is observable. Auto-detect cannot include NewBold because no safe query/response handshake exists.

For `PACKRACER-SIM`, the virtual port owns an explicit emulated-device identity, allowing the manually selected NewBold profile to connect without inventing an on-wire probe command.

## Operating Modes and Result Format

- Mode 1: one lane; emits elapsed time only. PackRacer's multi-lane parser does not currently support this headerless single-time form.
- Mode 2: two lanes; emits ordered lane/time pairs.
- Mode 3: DT8000 with three to eight connected sensors; emits ordered lane/time pairs for every detected lane.

Representative multi-lane output from the manual:

```text
1 2.5455 2 2.9831\r\n
3 2.8820 1 3.5109 4 3.5134 2 3.6202\r\n
```

Records are ordered by finish. Times are seconds. The timer waits for all detected sensors or until elapsed time exceeds 9.9999 seconds. PackRacer treats a time at or above 9.999 seconds as DNF and otherwise preserves the transmitted order as finish position.

There is no separate race-start or race-complete marker in the documented result stream. PackRacer stages a complete capture when all expected physical lanes have been parsed. A missing lane remains incomplete until the operator resolves it or uses Force Results where available.

## Simulator Behavior

The simulator emits fragmented ordered lane/time pairs at 7-bit-ASCII-compatible values. DNF is represented as the documented timer timeout value `9.9999`, not a made-up DNF token. Exact ties still carry the on-wire record order because NewBold communicates finish order by record position.

## Hardware Validation Needed

- Capture startup text from each DT model and any TURBO/DerbyStick variants.
- Confirm whether a space causes any response while the timer is already idle.
- Confirm CR/LF framing across firmware versions.
- Capture timeout/non-finisher output and confirm whether every missing lane is printed as `9.9999`.
- Decide whether Mode 1 headerless times should be supported as a dedicated single-lane profile.
