// Emits the four downloadable artifacts, tailored by task/data/hardware
// answers from questions.js. Every generator returns real file content —
// nothing here is a stub image of what a file would look like.
//
// All four converge on ONNX as the interchange format: the Colab notebook's
// last cell always exports model.onnx, and the Space/browser-stub/Docker
// generators all just load that one file. That's not a simplification for
// this demo — it's the same reason the rest of this site is ONNX-first.

import { FFLATE_URL, ORT_VERSION } from "../config.js";

// ---------- Colab notebook ----------

function toSource(text) {
  const lines = text.replace(/\n$/, "").split("\n");
  return lines.map((l, i) => (i < lines.length - 1 ? l + "\n" : l));
}
function md(text) {
  return { cell_type: "markdown", metadata: {}, source: toSource(text) };
}
function code(text) {
  return { cell_type: "code", execution_count: null, metadata: {}, outputs: [], source: toSource(text) };
}

const DATA_CELLS = {
  local: () => [
    md("## Load your dataset\nUpload the zip you exported from the [Annotation Studio](../annotate.html) (YOLO format)."),
    code(
      `from google.colab import files\nuploaded = files.upload()  # pick the .zip exported from the Annotation Studio\n\nimport zipfile\nzip_name = list(uploaded.keys())[0]\nwith zipfile.ZipFile(zip_name, "r") as z:\n    z.extractall("dataset")`
    ),
  ],
  drive: () => [
    md("## Load your dataset\nMounts Drive, then copies your dataset folder locally (training reads local disk much faster than Drive)."),
    code(
      `from google.colab import drive\ndrive.mount("/content/drive")\n\n# Point this at wherever you put the Annotation Studio export in Drive.\n!cp -r "/content/drive/MyDrive/your-dataset-folder" dataset`
    ),
  ],
  hf: () => [
    md("## Load your dataset\nPulls a dataset repo from the Hugging Face Hub."),
    code(
      `!pip install -q huggingface_hub\nfrom huggingface_hub import snapshot_download\n\ndataset_dir = snapshot_download(repo_id="your-username/your-dataset", repo_type="dataset")\n!cp -r "$dataset_dir" dataset`
    ),
  ],
  none: () => [
    md(
      "## You haven't labelled a dataset yet\nHead back to the [Annotation Studio](../annotate.html), label some images, and export in YOLO format. The zip it produces matches the folder structure the next cell expects (`images/`, `labels/`, `data.yaml`) — come back here once you have it, and use the **local folder** answer instead."
    ),
  ],
};

const TRAIN_CELLS = {
  detection: () => [
    md("## Train\nUltralytics YOLO — `data.yaml` is exactly what the Annotation Studio's YOLO export writes."),
    code(`!pip install -q ultralytics\nfrom ultralytics import YOLO\n\nmodel = YOLO("yolo11n.pt")\nresults = model.train(data="dataset/data.yaml", epochs=50, imgsz=640, patience=10)`),
  ],
  segmentation: () => [
    md("## Train\nUltralytics YOLO-seg — export from the Annotation Studio with **YOLO-seg** checked, not plain YOLO."),
    code(`!pip install -q ultralytics\nfrom ultralytics import YOLO\n\nmodel = YOLO("yolo11n-seg.pt")\nresults = model.train(data="dataset/data.yaml", epochs=50, imgsz=640, patience=10)`),
  ],
  classification: () => [
    md("## Train\nA timm backbone fine-tuned on an `ImageFolder`-shaped dataset (one subfolder per class under `dataset/train` and `dataset/val`)."),
    code(
      `!pip install -q timm torch torchvision\nimport torch, timm\nfrom torch.utils.data import DataLoader\nfrom torchvision import datasets, transforms\n\ntransform = transforms.Compose([transforms.Resize((224, 224)), transforms.ToTensor()])\ntrain_ds = datasets.ImageFolder("dataset/train", transform=transform)\nval_ds = datasets.ImageFolder("dataset/val", transform=transform)\ntrain_loader = DataLoader(train_ds, batch_size=32, shuffle=True)\nval_loader = DataLoader(val_ds, batch_size=32)\n\ndevice = "cuda" if torch.cuda.is_available() else "cpu"\nmodel = timm.create_model("efficientnet_b0", pretrained=True, num_classes=len(train_ds.classes)).to(device)\noptimizer = torch.optim.AdamW(model.parameters(), lr=3e-4)\ncriterion = torch.nn.CrossEntropyLoss()\n\nfor epoch in range(10):\n    model.train()\n    for x, y in train_loader:\n        x, y = x.to(device), y.to(device)\n        optimizer.zero_grad()\n        loss = criterion(model(x), y)\n        loss.backward()\n        optimizer.step()\n    print(f"epoch {epoch}: loss {loss.item():.4f}")`
    ),
  ],
  tabular: () => [
    md("## Train\nA RandomForest baseline — swap in whatever model class fits your problem once this loop is proven."),
    code(
      `!pip install -q scikit-learn pandas\nimport pandas as pd\nfrom sklearn.model_selection import train_test_split\nfrom sklearn.ensemble import RandomForestClassifier\nfrom sklearn.metrics import classification_report\n\ndf = pd.read_csv("dataset/data.csv")  # replace with your file\ntarget_col = "label"  # replace with your target column name\nX = df.drop(columns=[target_col])\ny = df[target_col]\nX_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)\n\nmodel = RandomForestClassifier(n_estimators=200, random_state=42)\nmodel.fit(X_train, y_train)\nprint(classification_report(y_test, model.predict(X_test)))`
    ),
  ],
};

const EVAL_CELLS = {
  detection: () => [code(`metrics = model.val()\nprint(metrics.box.map)  # mAP50-95`)],
  segmentation: () => [code(`metrics = model.val()\nprint(metrics.seg.map)  # mask mAP50-95`)],
  classification: () => [
    code(
      `model.eval()\ncorrect = total = 0\nwith torch.no_grad():\n    for x, y in val_loader:\n        x, y = x.to(device), y.to(device)\n        pred = model(x).argmax(1)\n        correct += (pred == y).sum().item()\n        total += y.size(0)\nprint(f"val accuracy: {correct/total:.3f}")`
    ),
  ],
  tabular: () => [], // classification_report already printed in the training cell
};

const EXPORT_CELLS = {
  detection: () => [md("## Export to ONNX\nThe browser stub, the Hugging Face Space, and the Docker bundle this page generated all load this same file."), code(`model.export(format="onnx", imgsz=640, simplify=True)`)],
  segmentation: () => [md("## Export to ONNX"), code(`model.export(format="onnx", imgsz=640, simplify=True)`)],
  classification: () => [
    md("## Export to ONNX"),
    code(`dummy = torch.randn(1, 3, 224, 224).to(device)\ntorch.onnx.export(model, dummy, "model.onnx", input_names=["input"], output_names=["output"], opset_version=17)`),
  ],
  tabular: () => [
    md("## Export to ONNX"),
    code(`!pip install -q skl2onnx onnx\nfrom skl2onnx import to_onnx\n\nonnx_model = to_onnx(model, X_train.values.astype("float32"))\nwith open("model.onnx", "wb") as f:\n    f.write(onnx_model.SerializeToString())`),
  ],
};

export function generateColabNotebook(answers) {
  const task = answers.task || "detection";
  const cells = [
    md(
      `# Train and export — ${task}\nGenerated by AfricanizeAI's [Deploy demo](../deploy.html). Runs top to bottom on Colab's free tier (Runtime → Change runtime type → GPU).`
    ),
    ...(DATA_CELLS[answers.data]?.() ?? DATA_CELLS.local()),
    ...(TRAIN_CELLS[task]?.() ?? TRAIN_CELLS.detection()),
    md("## Evaluate"),
    ...(EVAL_CELLS[task]?.() ?? []),
    ...(EXPORT_CELLS[task]?.() ?? EXPORT_CELLS.detection()),
    md(
      "## Next\nDownload `model.onnx` from the file browser on the left. Then either:\n- drop it into the Hugging Face Space bundle this page generated, or\n- open the browser deployment stub this page generated and point it at the file, or\n- put it next to the Dockerfile this page generated for a self-hosted API."
    ),
  ];
  const notebook = {
    cells,
    metadata: {
      kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
      language_info: { name: "python" },
      colab: { provenance: [] },
      accelerator: "GPU",
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
  return JSON.stringify(notebook, null, 1);
}

// ---------- Hugging Face Space (Gradio) ----------

const SPACE_APP = {
  tabular: (title) => `import gradio as gr
import numpy as np
import onnxruntime as ort

# Drop model.onnx (from the Colab notebook's export cell) next to this file.
session = ort.InferenceSession("model.onnx", providers=["CPUExecutionProvider"])
input_name = session.get_inputs()[0].name


def predict(*values):
    arr = np.array([values], dtype=np.float32)
    outputs = session.run(None, {input_name: arr})
    return str(outputs[0].tolist())


demo = gr.Interface(
    fn=predict,
    # One gr.Number per feature column your model expects, in the same order
    # they were in X_train.
    inputs=[gr.Number(label="feature_1"), gr.Number(label="feature_2")],
    outputs=gr.Textbox(label="Prediction"),
    title="${title}",
)

if __name__ == "__main__":
    demo.launch()
`,
  image: (title) => `import gradio as gr
import numpy as np
import onnxruntime as ort
from PIL import Image

# Drop model.onnx (from the Colab notebook's export cell) next to this file.
session = ort.InferenceSession("model.onnx", providers=["CPUExecutionProvider"])
input_name = session.get_inputs()[0].name


def predict(image: Image.Image):
    resized = image.convert("RGB").resize((640, 640))
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    arr = arr.transpose(2, 0, 1)[None, ...]  # NCHW
    outputs = session.run(None, {input_name: arr})
    # Raw output shapes, so you can see what you're working with. Swap this
    # for real postprocessing — detect.js on this site has a worked example
    # for YOLO's [1, 84, 8400] box+class output.
    return str([o.shape for o in outputs])


demo = gr.Interface(
    fn=predict,
    inputs=gr.Image(type="pil"),
    outputs=gr.Textbox(label="Raw model output"),
    title="${title}",
)

if __name__ == "__main__":
    demo.launch()
`,
};

export function generateSpaceBundle(answers) {
  const task = answers.task || "detection";
  const title = `${task[0].toUpperCase()}${task.slice(1)} demo`;
  const appPy = task === "tabular" ? SPACE_APP.tabular(title) : SPACE_APP.image(title);
  const requirements = task === "tabular" ? "gradio\nonnxruntime\nnumpy\n" : "gradio\nonnxruntime\nnumpy\npillow\n";
  const readme = `---
title: ${title}
emoji: \u{1F9E0}
colorFrom: blue
colorTo: pink
sdk: gradio
sdk_version: 4.44.0
app_file: app.py
pinned: false
license: mit
---

# ${title}

Generated by AfricanizeAI's [Deploy demo](https://charlesmunga21.github.io/AfricanizeAI/demos/deploy.html).

Upload \`model.onnx\` (exported by the Colab notebook this page also generated) into this Space alongside \`app.py\` before it will run — Spaces don't accept files over 10MB through the web UI, so for a bigger model use \`huggingface_hub\`'s \`upload_file\` from the notebook instead.
`;
  return { "app.py": appPy, "requirements.txt": requirements, "README.md": readme };
}

// ---------- Browser deployment stub ----------

export function generateBrowserStub(answers) {
  const task = answers.task || "detection";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Model runner — generated by AfricanizeAI</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; color: #0E1116; }
  h1 { font-size: 1.25rem; }
  .row { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
  pre { background: #F4F6F7; padding: 1rem; overflow-x: auto; border-radius: 4px; white-space: pre-wrap; word-break: break-word; }
  button { padding: 0.6rem 1rem; cursor: pointer; }
</style>
</head>
<body>
<h1>Run your ${task} model, entirely in this browser tab</h1>
<p>Generated by AfricanizeAI's <a href="https://charlesmunga21.github.io/AfricanizeAI/demos/deploy.html">Deploy demo</a> — the same ONNX Runtime Web pattern as <a href="https://charlesmunga21.github.io/AfricanizeAI/demos/live.html">live.html</a> on that site, stripped down to one file. No server, no upload — the model and the image both stay on this device.</p>

<div class="row">
  <label>1. Pick your exported model.onnx <input type="file" id="model-input" accept=".onnx"></label>
  <label>2. Pick an image <input type="file" id="image-input" accept="image/*"></label>
  <button id="run-btn" disabled>Run</button>
</div>

<pre id="output">Output will appear here.</pre>

<script type="module">
  import * as ort from "https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort.min.mjs";
  ort.env.wasm.numThreads = 1; // GitHub Pages-style static hosting has no COOP/COEP, so no SharedArrayBuffer — see this site's runtime.js for why

  const modelInput = document.getElementById("model-input");
  const imageInput = document.getElementById("image-input");
  const runBtn = document.getElementById("run-btn");
  const output = document.getElementById("output");

  let modelBuffer = null;
  let imageFile = null;

  modelInput.addEventListener("change", async (e) => {
    modelBuffer = await e.target.files[0].arrayBuffer();
    runBtn.disabled = !(modelBuffer && imageFile);
  });
  imageInput.addEventListener("change", (e) => {
    imageFile = e.target.files[0];
    runBtn.disabled = !(modelBuffer && imageFile);
  });

  runBtn.addEventListener("click", async () => {
    output.textContent = "Loading session...";
    const session = await ort.InferenceSession.create(modelBuffer, { executionProviders: ["wasm"] });

    const bitmap = await createImageBitmap(imageFile);
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 640;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, 640, 640);
    const { data } = ctx.getImageData(0, 0, 640, 640);

    const plane = 640 * 640;
    const tensorData = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      tensorData[i] = data[i * 4] / 255;
      tensorData[plane + i] = data[i * 4 + 1] / 255;
      tensorData[2 * plane + i] = data[i * 4 + 2] / 255;
    }

    const inputName = session.inputNames[0];
    const feeds = { [inputName]: new ort.Tensor("float32", tensorData, [1, 3, 640, 640]) };

    output.textContent = "Running...";
    const t0 = performance.now();
    const results = await session.run(feeds);
    const ms = (performance.now() - t0).toFixed(1);

    const summary = Object.entries(results).map(([name, t]) => \`\${name}: dims [\${t.dims.join(", ")}]\`).join("\\n");
    output.textContent = \`Ran in \${ms}ms (WASM, single-threaded)\\n\\n\${summary}\\n\\nThis prints raw tensor shapes — plug in your model's real postprocessing here (see detect.js on the AfricanizeAI site for a worked YOLO example).\`;
  });
</script>
</body>
</html>
`;
}

// ---------- Docker + FastAPI ----------

export function generateDockerBundle(answers) {
  const task = answers.task || "detection";
  const dockerfile = `FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
# Copy your exported model.onnx into this directory before building the image —
# it's deliberately not fetched at build time so this Dockerfile never needs
# credentials baked in.
COPY model.onnx .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`;

  const mainPy =
    task === "tabular"
      ? `import numpy as np
import onnxruntime as ort
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()
session = ort.InferenceSession("model.onnx", providers=["CPUExecutionProvider"])
input_name = session.get_inputs()[0].name


class Features(BaseModel):
    values: list[float]  # one entry per feature column, same order as training


@app.post("/predict")
async def predict(payload: Features):
    arr = np.array([payload.values], dtype=np.float32)
    outputs = session.run(None, {input_name: arr})
    return {"prediction": outputs[0].tolist()}


@app.get("/health")
async def health():
    return {"status": "ok"}

# If your model needs an API key or other secret at runtime, read it via
# os.environ — never hardcode it here or bake it into the image.
`
      : `import io
import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, UploadFile
from PIL import Image

app = FastAPI()
session = ort.InferenceSession("model.onnx", providers=["CPUExecutionProvider"])
input_name = session.get_inputs()[0].name


@app.post("/predict")
async def predict(file: UploadFile):
    image = Image.open(io.BytesIO(await file.read())).convert("RGB").resize((640, 640))
    arr = (np.asarray(image, dtype=np.float32) / 255.0).transpose(2, 0, 1)[None, ...]
    outputs = session.run(None, {input_name: arr})
    # Raw output shapes — swap in your real postprocessing (detect.js on this
    # site has a worked example for YOLO's box+class output).
    return {"output_shapes": [list(o.shape) for o in outputs]}


@app.get("/health")
async def health():
    return {"status": "ok"}

# If your model needs an API key or other secret at runtime, read it via
# os.environ — never hardcode it here or bake it into the image.
`;

  const requirements =
    task === "tabular"
      ? "fastapi\nuvicorn[standard]\nonnxruntime\nnumpy\npydantic\n"
      : "fastapi\nuvicorn[standard]\nonnxruntime\nnumpy\npillow\npython-multipart\n";

  return { Dockerfile: dockerfile, "main.py": mainPy, "requirements.txt": requirements };
}

// ---------- Zipping a multi-file bundle ----------

export async function zipBundle(files) {
  const { zipSync, strToU8 } = await import(/* @vite-ignore */ FFLATE_URL);
  const encoded = Object.fromEntries(Object.entries(files).map(([name, content]) => [name, strToU8(content)]));
  return new Blob([zipSync(encoded, { level: 6 })], { type: "application/zip" });
}
