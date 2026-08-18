// The decision tree's data: five fixed questions and the recommendation
// logic that turns answers into "here is the one path to follow" prose.
// generators.js reads the same `answers` object to tailor the artifacts —
// this file owns no file-generation, only the questions and the recommendation.

export const QUESTIONS = [
  {
    id: "task",
    prompt: "What are you building?",
    options: [
      { value: "classification", label: "Image classification", hint: "one label per image" },
      { value: "detection", label: "Object detection", hint: "boxes around things" },
      { value: "segmentation", label: "Segmentation", hint: "pixel-level masks" },
      { value: "tabular", label: "Tabular / other", hint: "spreadsheets, sensor logs, text" },
    ],
  },
  {
    id: "data",
    prompt: "Where is your data?",
    options: [
      { value: "local", label: "A local folder on my machine" },
      { value: "drive", label: "Google Drive" },
      { value: "hf", label: "Already on Hugging Face" },
      { value: "none", label: "Not collected yet" },
    ],
  },
  {
    id: "hardware",
    prompt: "What hardware do you have?",
    options: [
      { value: "none", label: "None — just a phone or Chromebook" },
      { value: "cpu", label: "A laptop CPU" },
      { value: "colab", label: "Colab free tier" },
      { value: "gpu", label: "A rented GPU" },
    ],
  },
  {
    id: "budget",
    prompt: "What is your budget?",
    options: [
      { value: "free", label: "$0 only" },
      { value: "low", label: "Under $20/month" },
      { value: "flexible", label: "Flexible" },
    ],
  },
  {
    id: "audience",
    prompt: "Who needs to use the result?",
    options: [
      { value: "me", label: "Just me" },
      { value: "colleagues", label: "A few colleagues" },
      { value: "public", label: "Public web users" },
      { value: "phones", label: "Offline, on phones" },
    ],
  },
];

const TASK_LABEL = {
  classification: "image classification",
  detection: "object detection",
  segmentation: "segmentation",
  tabular: "a tabular model",
};

const DATA_STEP = {
  local: "zip your labelled folder and upload it into the Colab notebook",
  drive: "mount Google Drive in the Colab notebook and point it at your dataset folder",
  hf: "pull your dataset straight from the Hugging Face Hub in the Colab notebook",
  none: "the Annotation Studio on this site exports directly to the folder structure these notebooks expect",
};

// One paragraph of plain-English reasoning, plus which of the four generated
// artifacts actually make sense for this combination of answers — every
// artifact is still downloadable regardless, this just says which to start with.
export function recommend(answers) {
  const { task, data, hardware, budget, audience } = answers;
  const notes = [];
  const artifacts = new Set();

  if (data === "none") {
    notes.push(`You haven't labelled data yet — ${DATA_STEP.none}.`);
  }

  if (hardware === "none" || hardware === "cpu" || hardware === "colab") {
    artifacts.add("colab");
    notes.push(
      data === "none"
        ? "Once you have a dataset, the same free Colab notebook runs the training and ONNX-export cells."
        : `Train in the free Colab notebook: ${DATA_STEP[data] ?? DATA_STEP.local}, then run the training and ONNX-export cells.`
    );
  } else {
    artifacts.add("colab");
    artifacts.add("docker");
    notes.push("Your rented GPU can run the same training script outside Colab — the notebook still works locally with Jupyter, or use it as a reference for your own script.");
  }

  if (audience === "phones" || (budget === "free" && (audience === "me" || audience === "colleagues"))) {
    artifacts.add("browser");
    notes.push("For serving: the browser stub runs your exported ONNX model entirely client-side — free, and it works offline, which matches this site's whole point.");
  }

  if (audience === "colleagues" || audience === "public") {
    artifacts.add("space");
    notes.push(
      audience === "public"
        ? "For a public demo, a Hugging Face Space gives you a shareable URL with zero server management — free tier is CPU-only, upgrade for GPU inference."
        : "For a few colleagues, a Hugging Face Space (free tier) is the lowest-effort way to give them a working link."
    );
  }

  if (budget === "flexible" && (audience === "public" || audience === "colleagues")) {
    artifacts.add("docker");
    notes.push("With a flexible budget and real traffic expected, the Dockerfile + FastAPI bundle gives you a container you can put behind your own domain and scale independently of any platform's free-tier limits.");
  }

  return {
    summary: `Building ${TASK_LABEL[task] ?? task}. ${notes.join(" ")}`,
    artifacts,
  };
}
