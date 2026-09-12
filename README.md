# Brain Speed Exercises

![Testing Status](https://github.com/acrosman/BrainSpeedExercises/actions/workflows/test.yml/badge.svg)
![Lint Status](https://github.com/acrosman/BrainSpeedExercises/actions/workflows/lint.yml/badge.svg)
![CodeQL Status](https://github.com/acrosman/BrainSpeedExercises/actions/workflows/codeql-analysis.yml/badge.svg)

A desktop application for brain-speed training — pick a game, play it, and track your progress over time. Inspired by the research in [this study on dementia](https://www.npr.org/2026/02/18/nx-s1-5716010/brain-training-exercise-cut-dementia-risk-decades).

## Games

Brain Speed Exercises ships with eight games, each targeting a different cognitive skill:

| Game | What it trains |
| ---- | -------------- |
| **Directional Processing** | Rapid visual motion perception — identify the direction of a briefly-displayed moving Gabor pattern. |
| **Fast Piggie** | Visual attention — spot the different guinea pig before they disappear! |
| **Field of View** | Split attention — identify the center kitten and the peripheral toys under rapid masked flashes. |
| **High Speed Memory** | Working memory — memorize the grid of cards, then find all the matching pairs from memory. |
| **Object Track** | Attention and visual memory — track multiple moving targets among identical distractors. |
| **Orbit Sprite Memory** | Spatial memory — track where the target sprite appears around the circle, then pick its three positions. |
| **Otter Stop** | Inhibitory control — react fast to each otter, but freeze when the no-go fish appears. |
| **Sound Sweep** | Auditory processing — hear two rapid frequency sweeps and identify the sequence. |

Your high score and session history for each game are saved automatically.

## Getting the App

### Finding the Latest Release

Visit the [Releases page](https://github.com/acrosman/BrainSpeedExercises/releases) and open the
most recent release (the one at the top of the list). Under **Assets**, download the installer for
your operating system (see the table below).

### Choosing Your Installer

| Operating System | File to download |
| ---------------- | ---------------- |
| **macOS** (Apple Silicon — M1/M2/M3/M4) | `brain-speed-exercises-X.X.X-arm64.dmg` |
| **Windows** | `brain-speed-exercises-X.X.X.Setup.exe` |
| **Linux** (Debian / Ubuntu) | `brain-speed-exercises_X.X.X_amd64.deb` |
| **Linux** (Fedora / RHEL / openSUSE) | `brain-speed-exercises-X.X.X-1.x86_64.rpm` |

Replace `X.X.X` with the version number of the release you downloaded (e.g. `0.1.0`).

> **Note:** macOS Intel builds are not currently published. If you are on an older Intel Mac you
> will need to [build from source](#building-from-source).

---

### macOS Installation

1. Download the `.dmg` file.
2. Double-click the downloaded file to mount the disk image.
3. Drag **Brain Speed Exercises** into your **Applications** folder.
4. Eject the disk image, then open **Brain Speed Exercises** from Applications.

> **First-launch security prompt:** macOS may warn that the app is from an unidentified developer.
> To open it the first time, right-click (or Control-click) the app icon and choose **Open**, then
> click **Open** again in the dialog.

---

### Windows Installation

1. Download the `.Setup.exe` file.
2. Double-click the installer and follow the on-screen prompts.
3. Once installed, launch **Brain Speed Exercises** from the Start menu or the desktop shortcut.

> **Windows Defender SmartScreen:** If a blue "Windows protected your PC" dialog appears, click
> **More info** and then **Run anyway**.

---

### Linux Installation

**Debian / Ubuntu** (`.deb`):

```bash
sudo dpkg -i brain-speed-exercises_X.X.X_amd64.deb
```

**Fedora / RHEL / openSUSE** (`.rpm`):

```bash
sudo rpm -i brain-speed-exercises-X.X.X-1.x86_64.rpm
```

After installation, launch **Brain Speed Exercises** from your applications menu, or run
`brain-speed-exercises` from a terminal.

---

## Building from Source

If you prefer to run directly from source code (or your platform is not covered by the pre-built
installers), see the [Contributing Guide](./contributing.md) for prerequisites and setup steps.

## Contributing

Contributions are welcome! See [`contributing.md`](./contributing.md) for guidelines on reporting
bugs, suggesting features, and submitting pull requests.

## License

MIT
