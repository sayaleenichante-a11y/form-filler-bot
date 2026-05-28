import re
from difflib import SequenceMatcher


def normalize(text):
    text = str(text or "")
    text = re.sub(r"[_\-]+", " ", text)
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
    text = re.sub(r"[^a-zA-Z0-9@.+/%₹$ ]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.lower().strip()


def clean_value(value, max_len=300):
    value = str(value or "").strip()
    value = re.sub(r"\s+", " ", value)
    return value[:max_len]


def similarity(a, b):
    a = normalize(a)
    b = normalize(b)

    if not a or not b:
        return 0

    return SequenceMatcher(None, a, b).ratio()


def get_lines(text):
    return [line.strip() for line in str(text or "").splitlines() if line.strip()]


def extract_between_sections(text, start_keywords, end_keywords):
    lines = get_lines(text)
    start_index = -1

    for i, line in enumerate(lines):
        line_norm = normalize(line)

        for key in start_keywords:
            key_norm = normalize(key)

            if key_norm == line_norm or key_norm in line_norm:
                start_index = i + 1
                break

        if start_index != -1:
            break

    if start_index == -1:
        return ""

    block = []

    for line in lines[start_index:]:
        line_norm = normalize(line)

        stop = False

        for end in end_keywords:
            end_norm = normalize(end)

            if line_norm == end_norm or line_norm.startswith(end_norm):
                stop = True
                break

        if stop:
            break

        block.append(line)

    return "\n".join(block).strip()


def clean_url(url):
    url = str(url or "").strip().strip("|,;()[]{}<>")

    if not url:
        return ""

    if url.startswith("www."):
        url = "https://" + url

    if (
        "://" not in url
        and (
            url.startswith("linkedin.com")
            or url.startswith("github.com")
            or "." in url
        )
    ):
        url = "https://" + url

    return url


def extract_contact_info(text):
    lines = get_lines(text)
    data = {}

    # Full name
    for line in lines[:10]:
        if re.search(r"@|linkedin|github|http|www|\+?\d{10}", line, re.I):
            continue

        words = line.split()

        if 2 <= len(words) <= 4 and len(line) <= 70:
            if all(w[0].isupper() for w in words if w and w[0].isalpha()):
                data["full_name"] = clean_value(line)
                data["name"] = clean_value(line)

                if len(words) >= 2:
                    data["first_name"] = words[0]
                    data["last_name"] = words[-1]

                break

    # Email
    email_match = re.search(r"[\w\.-]+@[\w\.-]+\.\w+", text)
    if email_match:
        data["email"] = email_match.group(0)

    # Phone
    phone_match = re.search(r"(?:\+91[\s\-]*)?[6-9]\d{9}", text)
    if phone_match:
        data["phone"] = phone_match.group(0).strip()

    # LinkedIn
    linkedin_patterns = [
        r"(?:https?://)?(?:www\.)?linkedin\.com/in/[A-Za-z0-9_\-/%]+",
        r"(?:https?://)?(?:www\.)?linkedin\.com/[A-Za-z0-9_\-/%]+"
    ]

    for pattern in linkedin_patterns:
        match = re.search(pattern, text, re.I)
        if match:
            data["linkedin"] = clean_url(match.group(0))
            data["linkedin_url"] = clean_url(match.group(0))
            break

    # GitHub
    github_patterns = [
        r"(?:https?://)?(?:www\.)?github\.com/[A-Za-z0-9_\-/%]+"
    ]

    for pattern in github_patterns:
        match = re.search(pattern, text, re.I)
        if match:
            data["github"] = clean_url(match.group(0))
            data["github_url"] = clean_url(match.group(0))
            break

    # All URLs
    url_matches = re.findall(
        r"(?:https?://[^\s|,]+|www\.[^\s|,]+|[A-Za-z0-9_\-]+\.[A-Za-z]{2,}[^\s|,]*)",
        text,
        re.I
    )

    cleaned_urls = []

    for url in url_matches:
        url = clean_url(url)

        if not url:
            continue

        if "@" in url:
            continue

        if url not in cleaned_urls:
            cleaned_urls.append(url)

    # Portfolio / website = first non-linkedin and non-github URL
    for url in cleaned_urls:
        url_lower = url.lower()

        if "linkedin.com" in url_lower:
            continue

        if "github.com" in url_lower:
            continue

        data["portfolio"] = url
        data["portfolio_url"] = url
        data["website"] = url
        break

    # Fallback: if portfolio not found, still keep any URL as website
    if "website" not in data and cleaned_urls:
        data["website"] = cleaned_urls[0]

    return data


def extract_education_info(text):
    data = {}

    edu_block = extract_between_sections(
        text,
        ["Education", "Academic Details", "Educational Qualification", "Qualification"],
        [
            "Experience", "Internship", "Projects", "Project",
            "Technical Skills", "Skills", "Certifications",
            "Achievements", "Declaration", "Publications"
        ]
    )

    search_area = edu_block if edu_block else text
    lines = get_lines(search_area)

    cgpa_match = re.search(
        r"CGPA\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)",
        search_area,
        re.I
    )
    if cgpa_match:
        data["cgpa"] = cgpa_match.group(1)

    percentage_match = re.search(
        r"Percentage\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*%?",
        search_area,
        re.I
    )
    if percentage_match:
        data["percentage"] = percentage_match.group(1)

    years = re.findall(r"\b(20\d{2})\b", search_area)
    if years:
        data["passing_year"] = max(years)

    for line in lines[:12]:
        line_norm = normalize(line)

        if any(word in line_norm for word in [
            "college",
            "university",
            "institute",
            "technology",
            "campus"
        ]):
            if (
                "diploma" not in line_norm
                and "cgpa" not in line_norm
                and "percentage" not in line_norm
            ):
                data["college"] = clean_value(line)
                break

    degree_patterns = [
        r"(B\.?\s?Tech|B\.?\s?E|Bachelor of Engineering|Bachelor of Technology|MCA|M\.?\s?Tech|Diploma)\s+(?:in\s+)?([A-Za-z &]+)",
        r"(Computer Science and Engineering|Information Technology|Electronics|Mechanical|Civil|Electrical|Artificial Intelligence|Data Science)"
    ]

    for pattern in degree_patterns:
        match = re.search(pattern, search_area, re.I)

        if match:
            if len(match.groups()) >= 2:
                data["degree"] = clean_value(match.group(1))
                data["branch"] = clean_value(match.group(2))
            else:
                data["branch"] = clean_value(match.group(1))

            break

    return data


def extract_skills_info(text):
    data = {}

    skills_block = extract_between_sections(
        text,
        ["Technical Skills", "Skills"],
        [
            "Certifications", "Achievements", "Position",
            "Declaration", "Education", "Experience",
            "Projects", "Publications"
        ]
    )

    if not skills_block:
        return data

    lines = get_lines(skills_block)
    skill_parts = []

    for line in lines:
        line_norm = normalize(line)

        if any(key in line_norm for key in [
            "languages",
            "frameworks",
            "developer tools",
            "tools",
            "libraries",
            "database",
            "technologies",
            "platforms"
        ]):
            if ":" in line:
                skill_parts.append(line.split(":", 1)[1].strip())
            else:
                skill_parts.append(line)

    if skill_parts:
        data["skills"] = clean_value(", ".join(skill_parts), max_len=600)
    else:
        data["skills"] = clean_value(", ".join(lines), max_len=600)

    return data


def extract_experience_info(text):
    data = {}

    exp_block = extract_between_sections(
        text,
        ["Experience", "Work Experience", "Internship"],
        [
            "Projects", "Technical Skills", "Skills",
            "Education", "Certifications"
        ]
    )

    if not exp_block:
        return data

    lines = get_lines(exp_block)

    if lines:
        data["experience"] = clean_value(lines[0], max_len=180)

    return data


def extract_generic_key_values(text):
    data = {}
    lines = get_lines(text)

    key_alias = {
        "company": ["company", "company name", "organization", "organisation", "firm"],
        "address": ["address", "current address", "permanent address"],
        "city": ["city", "current city", "location"],
        "state": ["state"],
        "country": ["country"],
        "pincode": ["pincode", "pin code", "postal code", "zip"],
        "job_role": ["job role", "role", "position", "designation"],
        "job_location": ["job location", "work location"],
        "salary": ["salary", "package", "ctc", "stipend", "package offered"],
        "project_title": ["project title", "proposal title", "title"],
        "description": ["description", "project description", "proposal description"],
        "date": ["date", "dob", "birth date", "deadline", "joining date"],
        "pan": ["pan", "pan number", "pan card"],
        "gst": ["gst", "gstin", "gst number"]
    }

    for line in lines:
        if len(line) > 220:
            continue

        if ":" in line:
            key, value = line.split(":", 1)
        elif " - " in line:
            key, value = line.split(" - ", 1)
        else:
            continue

        key_norm = normalize(key)
        value = clean_value(value)

        if not value:
            continue

        for canonical_key, aliases in key_alias.items():
            for alias in aliases:
                alias_norm = normalize(alias)

                if alias_norm == key_norm or alias_norm in key_norm:
                    data[canonical_key] = value
                    break

    pincode = re.search(r"\b[1-9][0-9]{5}\b", text)
    if pincode and "pincode" not in data:
        data["pincode"] = pincode.group(0)

    pan = re.search(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", text)
    if pan and "pan" not in data:
        data["pan"] = pan.group(0)

    gst = re.search(
        r"\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b",
        text
    )
    if gst and "gst" not in data:
        data["gst"] = gst.group(0)

    return data


def extract_summary(text, data):
    name = data.get("full_name", "")
    degree = data.get("degree", "")
    branch = data.get("branch", "")
    skills = data.get("skills", "")

    parts = []

    if name:
        parts.append(name)

    if degree or branch:
        parts.append(f"{degree} {branch}".strip())

    if skills:
        parts.append(f"Skilled in {skills}")

    if parts:
        return clean_value(". ".join(parts), max_len=500)

    lines = get_lines(text)
    paragraph = " ".join(lines[:5])
    return clean_value(paragraph, max_len=500)


def extract_entities(text):
    data = {}

    data.update(extract_generic_key_values(text))
    data.update(extract_contact_info(text))
    data.update(extract_education_info(text))
    data.update(extract_skills_info(text))
    data.update(extract_experience_info(text))

    summary = extract_summary(text, data)

    if summary:
        data["summary"] = summary
        data["candidate_summary"] = summary

    return data


FIELD_RULES = {
    "full_name": [
        "full name", "candidate name", "applicant name",
        "student name", "employee name", "person name", "name"
    ],
    "first_name": ["first name", "given name"],
    "last_name": ["last name", "surname", "family name"],
    "email": ["email", "email address", "mail id", "mail"],
    "phone": [
        "mobile number", "phone number", "contact number",
        "telephone", "whatsapp number", "mobile", "phone"
    ],
    "linkedin": [
    "linkedin",
    "linkedin profile",
    "linkedin url",
    "linkedin link",
    "linkedin profile url",
    "linkedin profile link"
],
    "github": [
        "github",
        "github profile",
        "github url",
        "github link",
        "github profile url",
        "github profile link"
    ],
    "portfolio": [
        "portfolio",
        "portfolio link",
        "portfolio url",
        "portfolio website",
        "personal portfolio",
        "personal website"
    ],
    "website": [
        "website",
        "website link",
        "website url",
        "personal website",
        "url"
    ],
    "resume_link": [
        "resume link",
        "resume url",
        "cv link",
        "cv url",
        "drive resume link"
    ],
    "address": [
        "address", "current address", "permanent address",
        "residential address"
    ],
    "city": ["city", "current city", "location", "current location"],
    "state": ["state"],
    "country": ["country"],
    "pincode": ["pincode", "pin code", "postal code", "zip"],
    "college": [
        "college name", "university name", "institute name",
        "college", "university", "institute"
    ],
    "degree": ["degree", "qualification", "course", "program"],
    "branch": ["branch", "stream", "specialization", "department"],
    "cgpa": ["cgpa", "gpa", "grade point", "pointer"],
    "percentage": ["percentage", "percent", "marks"],
    "passing_year": [
        "passing year", "graduation year",
        "year of passing", "passout year"
    ],
    "skills": [
        "skills", "technical skills", "required skills",
        "technologies", "programming languages",
        "tools", "frameworks"
    ],
    "experience": [
        "experience", "work experience",
        "internship experience"
    ],
    "summary": [
        "candidate summary", "professional summary",
        "profile summary", "about candidate",
        "about", "summary", "objective"
    ],
    "company": [
        "company name", "organization name",
        "organisation name", "firm name",
        "company", "organization", "organisation"
    ],
    "job_role": [
        "job role", "role", "position",
        "designation", "job title"
    ],
    "job_location": [
        "job location", "work location",
        "office location"
    ],
    "salary": [
        "package offered", "package", "ctc",
        "salary", "stipend"
    ],
    "project_title": [
        "project title", "proposal title", "title"
    ],
    "description": [
        "description", "project description",
        "proposal description"
    ],
    "date": [
        "date", "dob", "birth date",
        "joining date", "deadline"
    ],
    "pan": ["pan", "pan card", "pan number"],
    "gst": ["gst", "gstin", "gst number"]
}


SKIP_TYPES = [
    "hidden",
    "submit",
    "button",
    "reset",
    "password"
]


def field_text(field):
    parts = [
        field.get("label", ""),
        field.get("name", ""),
        field.get("id", ""),
        field.get("placeholder", ""),
        field.get("ariaLabel", ""),
        field.get("role", ""),
        field.get("autocomplete", ""),
        field.get("nearText", ""),
        field.get("type", "")
    ]

    return normalize(" ".join(parts))


def detect_field_key(field):
    text = field_text(field)

    if not text:
        return None, 0

    best_key = None
    best_score = 0

    for key, aliases in FIELD_RULES.items():
        for alias in aliases:
            alias_norm = normalize(alias)

            score = similarity(text, alias_norm)

            if alias_norm in text:
                score += 0.45

            text_words = set(text.split())
            alias_words = set(alias_norm.split())

            if alias_words and alias_words.issubset(text_words):
                score += 0.35

            autocomplete = normalize(field.get("autocomplete", ""))

            if autocomplete and alias_norm in autocomplete:
                score += 0.30

            if score > best_score:
                best_score = score
                best_key = key

    if best_score >= 0.48:
        return best_key, best_score

    return None, best_score


def choose_select_value(value, options):
    if not options:
        return value

    best = ""
    best_score = 0

    for option in options:
        score = similarity(value, option)

        if normalize(value) in normalize(option) or normalize(option) in normalize(value):
            score += 0.30

        if score > best_score:
            best_score = score
            best = option

    if best_score >= 0.45:
        return best

    return value


def map_document_to_fields(text, fields):
    entities = extract_entities(text)
    matches = []

    for field in fields:
        tag = field.get("tag", "")
        field_type = normalize(field.get("type", ""))

        if tag not in ["input", "textarea", "select", "div"]:
            continue

        if field_type in SKIP_TYPES:
            continue

        if field_type == "file":
            continue

        key, score = detect_field_key(field)

        if not key:
            continue

        value = entities.get(key, "")
        
                # URL field fallback
        if not value and key == "portfolio":
            value = entities.get("portfolio_url", "") or entities.get("website", "")

        if not value and key == "linkedin":
            value = entities.get("linkedin_url", "")

        if not value and key == "github":
            value = entities.get("github_url", "")

        if not value and key == "website":
            value = entities.get("portfolio_url", "") or entities.get("website", "")

        # Resume link can only be filled if the document contains an actual online resume URL
        if not value and key == "resume_link":
            value = entities.get("resume_link", "")
        if not value and key == "cgpa":
            value = entities.get("percentage", "")

        if not value and key == "percentage":
            value = entities.get("cgpa", "")

        if key in ["company", "salary", "job_location", "job_role"]:
            if key not in entities:
                continue

        if not value:
            continue

        if tag == "select":
            value = choose_select_value(value, field.get("options", []))

        matches.append({
            "index": field.get("index"),
            "value": value,
            "confidence": round(score, 3),
            "matched_key": key,
            "source": "smart_entity_mapper"
        })

    return {
        "matches": matches,
        "candidate_count": len(entities),
        "entities": entities
    }


def build_candidates(text):
    entities = extract_entities(text)
    candidates = []

    for key, value in entities.items():
        if value:
            candidates.append({
                "key": key,
                "value": value,
                "source": "smart_entity_mapper",
                "confidence": 0.90
            })

    return candidates