# Portfolio résumé source

`Paige_Edrington_Portfolio_Resume.docx` is the source for `/resume.pdf` (served from the repo root). This folder is not deployed: `.vercelignore` serves only an allowlist from the root.

## Regenerate the PDF

LibreOffice must be able to find Inter. In a sandboxed or headless shell it may silently fall back to a serif font, so give it a throwaway profile with Inter in its font folder:

```bash
mkdir -p /tmp/lo-resume/user/fonts && cp ~/Library/Fonts/Inter-*.otf /tmp/lo-resume/user/fonts/
soffice -env:UserInstallation=file:///tmp/lo-resume --headless --convert-to pdf --outdir /tmp docs/resume/Paige_Edrington_Portfolio_Resume.docx
cp /tmp/Paige_Edrington_Portfolio_Resume.pdf resume.pdf
```

Then check:
- **Pages:** two.
- **Fonts:** only Inter is embedded.
- **Links:** all six work: email, portfolio, LinkedIn, and the State, Project Health and Tastemake pages.
- **Headings:** they extract as plain words, e.g. `SELECTED AI PROJECTS`.

## Section heading letter spacing

The headings use 0.75pt letter spacing (`<w:spacing w:val="15"/>`). The Nov 3 version used 2pt and was built with LibreOffice 24.2. LibreOffice 26.8 exports wider spacing letter by letter, so text extractors (pypdf, macOS PDFKit, and likely applicant tracking systems) read the headings as `S E L E C T E D  A I …`. At 0.75pt they extract cleanly; at 1pt they no longer do (Nov 26, 2026).
