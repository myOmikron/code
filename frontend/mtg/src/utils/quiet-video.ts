/**
 * Two seconds of black, silent, 16 by 16, as a data url.
 *
 * It exists for {@link useWakeLock} to loop where the screen wake lock is not
 * offered: a browser playing a video does not let the screen lock, and on an
 * older ipad that is the only lever there is.
 *
 * Inline rather than a file in `public/`, for two reasons: the service worker
 * only precaches the app shell (js, css, html, svg, woff2), so a `.mp4` beside
 * it would be the one thing a table needs and the one thing missing without a
 * network; and a request that has to succeed before the screen stays on is a
 * request worth not making.
 *
 * H.264 constrained baseline, which is what safari decodes, and no audio track
 * at all — the point is that nothing is heard and nothing takes over the
 * device's media controls. Regenerate with:
 *
 * ```sh
 * ffmpeg -f lavfi -i color=c=black:s=16x16:r=1:d=2 -c:v libx264 \
 *     -profile:v baseline -level 1.0 -pix_fmt yuv420p -crf 51 -g 1 -an \
 *     -bsf:v "filter_units=remove_types=6" -fflags +bitexact -flags:v +bitexact \
 *     -movflags +faststart quiet.mp4
 * base64 -w0 quiet.mp4
 * ```
 *
 * The bitstream filter drops the encoder's SEI banner, which is otherwise most
 * of the file: 823 bytes with it gone, against 1.4 kB.
 */
export const QUIET_VIDEO =
    "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAALpbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAjh0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAGwbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABW21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAARtzdGJsAAAAt3N0c2QAAAAAAAAAAQAAAKdhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABDExhdmMgbGlieDI2NAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAALWF2Y0MBQsAK/+EAFWdCwArd7ARAAAADAEAAAAMAg8SJ4AEABWjOAZSyAAAAEHBhc3AAAAABAAAAAQAAABRidHJ0AAAAAAAAAHgAAAAAAAAAGHN0dHMAAAAAAAAAAQAAAAIAAEAAAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAACAAAAAQAAABRzdHN6AAAAAAAAAA8AAAACAAAAFHN0Y28AAAAAAAAAAQAAAxkAAAA9dWR0YQAAADVtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAAhpbHN0AAAACGZyZWUAAAAmbWRhdAAAAAtliIQEvJigACC/gAAAAAtliIIBzyYoAAi24A==";
