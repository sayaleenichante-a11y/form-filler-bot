import openpyxl


def clean_value(value):
    if value is None:
        return ""

    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return str(round(value, 4))

    return str(value).strip()


def get_cell(row, index):
    if len(row) > index:
        return row[index]
    return None


def normalize_core_buffer(value):
    value = clean_value(value)
    lower = value.lower()

    if "buffer" in lower:
        return "Buffer Zone"

    if "core" in lower:
        return "Core Zone"

    return value


def normalize_pollutant(value):
    value = clean_value(value)

    value_upper = (
        value.upper()
        .replace(" ", "")
        .replace("-", "")
        .replace("₂", "2")
    )

    mapping = {
        "PM10": "PM10",
        "PM2.5": "PM2.5",
        "PM25": "PM2.5",
        "SO2": "SO2",
        "NOX": "NOx",
        "NOX.": "NOx",
        "CO": "CO"
    }

    return mapping.get(value_upper, value)


def normalize_unit(value):
    value = clean_value(value)
    lower = value.lower()

    if not value:
        return "Microgram per m3"

    if (
        "micro" in lower
        or "µg" in lower
        or "μg" in lower
        or "ug" in lower
        or "µg/m³" in lower
        or "ug/m3" in lower
        or "microgram" in lower
    ):
        return "Microgram per m3"

    if "mg" in lower:
        return "mg/l"

    return value


def normalize_direction(value, default_value):
    value = clean_value(value).upper()

    if value in ["N", "S", "E", "W"]:
        return value

    return default_value


def parse_impact_prediction_excel(file_path):
    workbook = openpyxl.load_workbook(file_path, data_only=True)
    sheet = workbook.active

    rows = []

    for row in sheet.iter_rows(min_row=4, values_only=True):
        station_code = clean_value(get_cell(row, 0))

        if not station_code:
            continue

        if not station_code.upper().startswith("BGA"):
            continue

        pollutant = normalize_pollutant(get_cell(row, 11))
        unit = normalize_unit(get_cell(row, 12))

        if pollutant in ["PM10", "PM2.5", "SO2", "NOx", "CO"] and not unit:
            unit = "Microgram per m3"

        item = {
            "station_code": clean_value(get_cell(row, 0)),
            "monitoring_location": clean_value(get_cell(row, 1)),

            "lat_deg": clean_value(get_cell(row, 2)),
            "lat_min": clean_value(get_cell(row, 3)),
            "lat_sec": clean_value(get_cell(row, 4)),
            "lat_dir": normalize_direction(get_cell(row, 5), "N"),

            "long_deg": clean_value(get_cell(row, 6)),
            "long_min": clean_value(get_cell(row, 7)),
            "long_sec": clean_value(get_cell(row, 8)),
            "long_dir": normalize_direction(get_cell(row, 9), "E"),

            "core_buffer": normalize_core_buffer(get_cell(row, 10)),
            "criteria_pollutant": pollutant,
            "unit": unit,

            "baseline_concentration": clean_value(get_cell(row, 13)),
            "predicted_incremental": clean_value(get_cell(row, 14)),
            "total_glc": clean_value(get_cell(row, 15)),
            "prescribed_standard": clean_value(get_cell(row, 16))
        }

        rows.append(item)

    print("Parsed Impact Rows:", len(rows))

    if rows:
        print("First Row:", rows[0])

    return rows