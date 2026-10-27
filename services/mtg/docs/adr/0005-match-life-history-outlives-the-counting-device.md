# A Match's Life history outlives the counting device and is separate from its Result

A Tournament Match is counted for the whole table on one device, but its Life history belongs to the Match and remains available after the Tournament finishes. Save changes on the device immediately and retain them for later upload when the connection is unavailable; store the history on the server rather than relying on the standalone Life counter's temporary local totals. This preserves the record across closing the app and beyond the counting device.

Record starting totals, life and commander-damage changes, corrections, and the start and end of each Game, with timestamps and affected Participants. A new Game keeps the earlier Games' history. Display a run of taps as one understandable change.

The Life history is a record of what the table counted, not an authoritative Match result. Participants still explicitly report the Result, including from the Life counter, and the existing correction and dispute process applies. Reaching zero life never reports a Result automatically.

Only the Match's Participants and the Tournament's Organizers may read its Life history, including after the Tournament finishes; it is not public. Exactly one device leads the Life counter for a Match. Other devices may read the stored state, and another Participant may explicitly take over rather than creating a competing history merely by opening the Life counter.

Taking over requires a server connection and starts from the latest uploaded state. Normally the former device synchronizes first. If that device has failed, confirm explicitly that the new device will continue from the saved state; unsent changes remain on the former device. If it returns, retain those changes as a conflict instead of silently merging them into the new device's history. This trades uninterrupted offline handover for a single understandable record without concurrent writers.

Ending a Game explicitly records its winner or a draw. Starting the next Game resets its totals while retaining earlier Games. Their outcomes may prefill the Match's Result report but never submit it. Corrections remain visible in the Life history.

The standalone Life counter also keeps a local Life history and supports resuming it. Server persistence is initially limited to Tournament Matches.

Using the Life counter is optional: a Match and its Result reporting work without any Life history. Organizers may lead the Life counter for a table with Guests.
