// One source of truth for model URLs, versions, and thresholds. When a model
// changes, this is the only file that should need to change.
//
// Weights are hosted on the Hugging Face Hub, not in this repo (§1.4 of the
// build spec) — HF's CDN serves permissive CORS on public repo files, which
// is what lets fetch() pull these cross-origin from GitHub Pages.

export const ORT_VERSION = "1.27.0";
export const ORT_CDN_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
export const ORT_MODULE_URL = `${ORT_CDN_BASE}ort.webgpu.min.mjs`;

// zip packing for Annotation Studio exports — jsdelivr's `+esm` endpoint
// generates a browser ESM wrapper for any npm package, which is what lets us
// import a CDN dependency without a build step (§1.6).
export const FFLATE_URL = "https://cdn.jsdelivr.net/npm/fflate@0.8.2/+esm";

// Bump when the underlying weights change — model-cache.js keys the Cache
// Storage entry on this, so a version bump forces a re-download instead of
// silently serving stale weights from a repeat visit.
export const CACHE_VERSION = "v1";

export const MODELS = {
  detect: {
    name: "YOLO11n",
    url: "https://huggingface.co/giangndm/yolo11-onnx/resolve/main/yolo11n_640.onnx",
    // From the HF API's file listing — used for the pre-download consent prompt
    // and to sanity-check the fetched byte count.
    bytes: 10_720_104,
    inputSize: 640,
  },
  samEncoder: {
    name: "MobileSAM encoder",
    url: "https://huggingface.co/Acly/MobileSAM/resolve/main/mobile_sam_image_encoder.onnx",
    bytes: 28_157_093,
    // Longest-side target for the resize-before-encode step. Fixed by how
    // the model was exported — not a tunable.
    imgSize: 1024,
  },
  samDecoder: {
    name: "MobileSAM decoder",
    url: "https://huggingface.co/Acly/MobileSAM/resolve/main/sam_mask_decoder_single.onnx",
    bytes: 16_501_323,
  },
};

export const THRESHOLDS = {
  confidence: 0.35,
  iou: 0.45,
};

// The 80 COCO class names, in the index order YOLO11n's output channels use.
export const COCO_CLASSES = [
  "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
  "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
  "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
  "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
  "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
  "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
  "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair",
  "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
  "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator",
  "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush",
];
