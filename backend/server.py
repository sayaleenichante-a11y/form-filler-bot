from flask import Flask, request, jsonify
from flask_cors import CORS
from pathlib import Path
import tempfile
import json
import traceback

from extractor import extract_text
from ai_mapper import map_document_to_fields, build_candidates
from impact_excel_mapper import parse_impact_prediction_excel

app = Flask(__name__)
CORS(app)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "running",
        "message": "Smart Form Filler backend is active"
    })


@app.route("/extract-smart", methods=["POST"])
def extract_smart():
    try:
        uploaded_file = request.files.get("file")

        if not uploaded_file:
            return jsonify({
                "success": False,
                "error": "No file uploaded"
            }), 400

        fields_json = request.form.get("fields", "[]")

        try:
            fields = json.loads(fields_json)
        except Exception:
            fields = []

        temp_dir = Path(tempfile.gettempdir()) / "smart_form_filler"
        temp_dir.mkdir(parents=True, exist_ok=True)

        file_path = temp_dir / uploaded_file.filename
        uploaded_file.save(file_path)

        text = extract_text(file_path)

        if not text.strip():
            return jsonify({
                "success": False,
                "error": "No readable text found in file. If it is scanned image/PDF, install Tesseract OCR."
            }), 400

        mapping_result = map_document_to_fields(text, fields)

        return jsonify({
            "success": True,
            "matches": mapping_result["matches"],
            "candidate_count": mapping_result["candidate_count"],
            "entities": mapping_result.get("entities", {}),
            "text_length": len(text)
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "trace": traceback.format_exc()
        }), 500

@app.route("/extract", methods=["POST"])
def extract_old_route():
    return extract_smart()

@app.route("/debug-candidates", methods=["POST"])
def debug_candidates():
    try:
        uploaded_file = request.files.get("file")

        if not uploaded_file:
            return jsonify({"success": False, "error": "No file uploaded"}), 400

        temp_dir = Path(tempfile.gettempdir()) / "smart_form_filler"
        temp_dir.mkdir(parents=True, exist_ok=True)

        file_path = temp_dir / uploaded_file.filename
        uploaded_file.save(file_path)

        text = extract_text(file_path)
        candidates = build_candidates(text)

        return jsonify({
            "success": True,
            "text_length": len(text),
            "candidate_count": len(candidates),
            "candidates": candidates[:100]
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route("/parse-impact-excel", methods=["POST"])
def parse_impact_excel():
    try:
        uploaded_file = request.files.get("file")

        if not uploaded_file:
            return jsonify({
                "success": False,
                "error": "No Excel file uploaded"
            }), 400

        temp_dir = Path(tempfile.gettempdir()) / "smart_form_filler"
        temp_dir.mkdir(parents=True, exist_ok=True)

        file_path = temp_dir / uploaded_file.filename
        uploaded_file.save(file_path)

        rows = parse_impact_prediction_excel(file_path)

        return jsonify({
            "success": True,
            "totalRows": len(rows),
            "rows": rows
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "trace": traceback.format_exc()
        }), 500

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=False)