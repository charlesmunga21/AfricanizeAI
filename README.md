# AfricanizeAI

A free tutorial site covering programming fundamentals, data structures & algorithms, computer vision, applied AI, and how computers and networks actually work — built with African builders, researchers, and creators in mind.

## What's covered

Every topic is a GeeksforGeeks-style module: a landing page linking to several submodules, each with an interactive visual model and a short quiz.

- **Data Structures & Algorithms** — arrays, binary search, linked lists.
- **Computer Vision** — how machines interpret images, core tasks (classification, detection, segmentation), convolution, and transfer learning.
- **AI Use-Cases** — applied AI in business (forecasting, automation, personalization) and in creative work (writing, visual art, music).
- **Computer Functions** — how computers work (CPU, cache, RAM, disk, databases), networking basics (packets, DNS, routers, latency), and operating systems basics (processes, threads, scheduling, virtual memory).
- **IoT + Software** — where software meets hardware: sensors, actuators, microcontrollers vs. single-board computers, sensor-to-cloud pipelines, and real case studies (precision irrigation, camera-to-actuator).

## Demos

Five runnable, in-browser AI demos — no installs, no signups, no server:

- **Neural Network Playground** — train a small neural net on 2D toy data, watch the decision boundary form.
- **Annotation Studio** — draw boxes and polygons on your own images, export a real YOLO/COCO/VOC dataset, offline.
- **Real-Time Detection** — YOLO11n + MobileSAM running live on your camera feed, entirely on-device.
- **Set Up Your Own AI Platform** — answer a few questions, get a generated Colab notebook, Hugging Face Space, browser stub, or Docker/FastAPI bundle.
- **Ask the Docs** — a reading assistant: ask a plain-language question and get pointed to the exact tutorial section that answers it. Runs a small embedding model on-device and searches this site's actual content — retrieval only, so nothing is paraphrased or hallucinated.

## Tech

Plain HTML/CSS/JS — no build step, no framework. Easy to read, easy to extend, and deployable as-is on GitHub Pages. Demo model weights are hosted on the Hugging Face Hub rather than committed to the repo.

```
AfricanizeAI/
├── index.html      # homepage
├── articles/       # tutorial modules (module landing page + submodules)
├── demos/          # in-browser AI demos (playground, annotate, live, deploy, assistant)
├── css/style.css   # site styling
├── js/             # shared site scripts + per-module visualizers/quiz
└── scripts/        # one-off content-prep utilities (not a build step)
```

## Running locally

Just open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Status

Early stage — more tutorials and use-case articles are being added over time.

## License

© AfricanizeAI 2026. All rights reserved. See [LICENSE](LICENSE).
