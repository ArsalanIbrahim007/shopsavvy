# Contributing / Branch Workflow

To split work between the three of us (Arsalan, Abuzar, Muzammil) without stepping on
each other's changes, we use per-person feature branches + pull requests instead of
separate folders.

## Branch naming

`<name>/<short-feature-description>`

Examples:
- `arsalan/product-matching`
- `abuzar/discount-detection`
- `muzammil/scrapers`

## Workflow

1. Pull the latest `main` before starting new work:
   ```
   git checkout main
   git pull
   ```
2. Create your branch:
   ```
   git checkout -b <name>/<feature>
   ```
3. Commit and push your work to your own branch:
   ```
   git push -u origin <name>/<feature>
   ```
4. When a piece of work is ready, open a Pull Request into `main` on GitHub.
5. One of the other two reviews it before it gets merged. This is where conflicts
   get caught and resolved one PR at a time, instead of three copies of the app
   diverging in separate folders.
6. After merging, delete the branch to keep things tidy.

## Why not folders per person?

The app is one shared Express backend + one React frontend. Splitting it into
`arsalan/`, `abuzar/`, `muzammil/` folders would create three disconnected copies
of the app that don't line up file-for-file, making them harder to merge back
together than just resolving occasional git conflicts on a shared file.
