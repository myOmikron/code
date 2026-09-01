# The scanner's generated assets, as an image the app build copies from.
#
# These cannot be produced in CI. The card index is embedded from roughly 450000 reference scans
# (~40 GB) and the OCR models are fine-tuned on those same cards, together some hours of work on a
# machine that holds the corpus. Everything else under public/ is either in the repo or fetched by
# the build, so only these two live here.
#
# Built and pushed by hand when the index changes, and pinned by tag in frontend/mtg/Dockerfile so
# a release records which index it shipped. See `just mtg-assets`.
#
# Context is frontend/mtg/public, not the repo root: the root .dockerignore deliberately hides
# these directories from the app build so a local working copy cannot silently stand in for the
# pinned image, which is exactly how the released image came to have no index at all.
FROM scratch

COPY data /data
COPY tesseract/mtg.traineddata.gz /tesseract/
COPY tesseract/mtgjpn.traineddata.gz /tesseract/
COPY tesseract/mtgkor.traineddata.gz /tesseract/
COPY tesseract/mtgrus.traineddata.gz /tesseract/
COPY tesseract/mtgzhs.traineddata.gz /tesseract/
COPY tesseract/mtgzht.traineddata.gz /tesseract/
