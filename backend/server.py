from pathlib import Path
import json
import tempfile
import traceback

from flask import Flask, jsonify, request
from flask_cors import CORS

from extractor import extract_text

from ai_mapper import (
    build_candidates,
    map_document_to_fields
)

from impact_excel_mapper import (
    map_rows_to_fields,
    parse_structured_file
)


app = Flask(__name__)
CORS(app)


def save_upload(uploaded_file):
    temp_dir = (
        Path(tempfile.gettempdir())
        / "smart_form_filler"
    )

    temp_dir.mkdir(
        parents=True,
        exist_ok=True
    )

    safe_name = Path(
        uploaded_file.filename
        or "upload.bin"
    ).name

    file_path = temp_dir / safe_name

    uploaded_file.save(file_path)

    return file_path


def read_fields():
    try:
        fields = json.loads(
            request.form.get(
                "fields",
                "[]"
            )
        )

        if isinstance(fields, list):
            return fields

        return []

    except (
        TypeError,
        json.JSONDecodeError
    ):
        return []


@app.route(
    "/health",
    methods=["GET"]
)
def health():
    return jsonify({
        "status": "running",
        "message": (
            "Smart Form Filler backend is active"
        )
    })


@app.route(
    "/extract-smart",
    methods=["POST"]
)
def extract_smart():
    try:
        uploaded_file = (
            request.files.get("file")
        )

        if not uploaded_file:
            return jsonify({
                "success": False,
                "error": "No file uploaded"
            }), 400

        fields = read_fields()

        file_path = save_upload(
            uploaded_file
        )

        text = extract_text(
            file_path
        )

        if not str(text or "").strip():
            return jsonify({
                "success": False,
                "error": (
                    "No readable text found. "
                    "Scanned files may require "
                    "OCR/Tesseract."
                )
            }), 400

        result = map_document_to_fields(
            text,
            fields
        )

        return jsonify({
            "success": True,

            "matches": result.get(
                "matches",
                []
            ),

            "candidate_count": result.get(
                "candidate_count",
                0
            ),

            "entities": result.get(
                "entities",
                {}
            ),

            "summary": result.get(
                "summary",
                {}
            ),

            "text_length": len(text),
        })

    except Exception as error:
        return jsonify({
            "success": False,
            "error": str(error),
            "trace": traceback.format_exc()
        }), 500


@app.route(
    "/extract",
    methods=["POST"]
)
def extract_old_route():
    return extract_smart()


@app.route(
    "/debug-candidates",
    methods=["POST"]
)
def debug_candidates():
    try:
        uploaded_file = (
            request.files.get("file")
        )

        if not uploaded_file:
            return jsonify({
                "success": False,
                "error": "No file uploaded"
            }), 400

        file_path = save_upload(
            uploaded_file
        )

        text = extract_text(
            file_path
        )

        candidates = build_candidates(
            text
        )

        return jsonify({
            "success": True,
            "text_length": len(text),
            "candidate_count": len(candidates),
            "candidates": candidates[:200],
        })

    except Exception as error:
        return jsonify({
            "success": False,
            "error": str(error),
            "trace": traceback.format_exc()
        }), 500


@app.route(
    "/parse-structured-file",
    methods=["POST"]
)
@app.route(
    "/parse-impact-excel",
    methods=["POST"]
)
def parse_structured_file_route():
    try:
        uploaded_file = (
            request.files.get("file")
        )

        if not uploaded_file:
            return jsonify({
                "success": False,
                "error": (
                    "No structured file uploaded"
                )
            }), 400

        fields = read_fields()

        file_path = save_upload(
            uploaded_file
        )

        rows = parse_structured_file(
            file_path
        )

        mapped_rows = map_rows_to_fields(
            rows,
            fields
        )

        return jsonify({
            "success": True,
            "totalRows": len(rows),
            "mappedRowCount": len(mapped_rows),
            "rows": rows,
            "mappedRows": mapped_rows,
        })

    except Exception as error:
        return jsonify({
            "success": False,
            "error": str(error),
            "trace": traceback.format_exc()
        }), 500


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5050,
        debug=False
    )