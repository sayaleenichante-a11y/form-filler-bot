# Smart AI Form Filler Bot

Smart AI Form Filler Bot is a browser extension and Python backend tool that helps users fill website forms automatically using data extracted from uploaded files.

The user can upload a file such as a resume, PDF, DOCX, Excel, CSV, PPT, image, or text file. The bot extracts useful information from the file and fills matching fields on the currently opened website form.

---

## Project Objective

The main objective of this project is to reduce manual form-filling work.

Instead of copying data from documents and pasting it into website forms one by one, this bot automatically:

1. Reads uploaded file data
2. Scans website form fields
3. Matches file data with correct input fields
4. Fills the form automatically

---

## Features

* Upload and extract data from different file types
* Automatically scan website forms
* Fill input fields dynamically
* Supports text fields, textareas, select fields, and file upload fields
* Extracts resume data like name, email, phone, college, degree, skills, CGPA, LinkedIn, GitHub, and portfolio links
* Works as a browser extension
* Backend runs locally on the user's system
* Can be started automatically when the PC starts using a BAT file
* Shows bot UI at the bottom-right corner of the browser

---

## Supported File Types

The bot supports:

* PDF
* DOCX
* TXT
* Excel files
* CSV files
* PPTX files
* RTF files
* HTML files
* JSON files
* Images such as PNG, JPG, JPEG, WEBP, BMP, and TIFF

---

## Tech Stack

### Frontend / Extension

* HTML
* CSS
* JavaScript
* Chrome Extension Manifest V3

### Backend

* Python
* Flask
* Flask-CORS
* PyMuPDF
* python-docx
* pandas
* openpyxl
* python-pptx
* BeautifulSoup
* Tesseract OCR
* Custom AI/ML based field matching logic

---

## Project Structure

```text
smart-ai-form-filler/
│
├── start_bot.bat
│
├── backend/
│   ├── server.py
│   ├── extractor.py
│   ├── ai_mapper.py
│   └── requirements.txt
│
└── extension/
    ├── manifest.json
    ├── content.js
    ├── style.css
    ├── popup.html
    └── popup.js
```

---

## How It Works

1. User opens any website form.
2. Browser extension shows a floating bot at the bottom-right corner.
3. User uploads a file into the bot.
4. Extension scans all input fields from the website.
5. File is sent to the local Python backend.
6. Backend extracts text from the file.
7. AI mapper understands the extracted data.
8. Bot matches document values with website fields.
9. Correct fields are filled automatically.

---

## Backend Setup

Go to the backend folder:

```bash
cd backend
```

Create virtual environment:

```bash
python -m venv .venv
```

Activate virtual environment:

```bash
.\.venv\Scripts\activate
```

Install required packages:

```bash
pip install -r requirements.txt
```

Run the backend server:

```bash
python server.py
```

Backend will run on:

```text
http://127.0.0.1:5050
```

To check if backend is running, open:

```text
http://127.0.0.1:5050/health
```

---

## Browser Extension Setup

1. Open Chrome or Edge browser.
2. Go to extensions page:

```text
chrome://extensions
```

or

```text
edge://extensions
```

3. Turn ON Developer Mode.
4. Click Load Unpacked.
5. Select the `extension` folder.
6. Open any website form.
7. The bot will appear at the bottom-right corner.

---

## How to Use

1. Start the backend server.
2. Open a website form.
3. Click Scan Form.
4. Upload your file.
5. Click Extract & Fill.
6. The bot will fill matched fields automatically.

---

## Auto Start on Windows

This project includes a `start_bot.bat` file.

To run the backend automatically when the PC starts:

1. Press:

```text
Win + R
```

2. Type:

```text
shell:startup
```

3. Paste a shortcut of `start_bot.bat` in that folder.

Now the bot backend will start automatically when the system starts.

---

## Example Use Cases

This bot can be used for:

* Resume form filling
* Placement forms
* Job application forms
* Student information forms
* Company registration forms
* Proposal forms
* Invoice data forms
* General document-to-form automation