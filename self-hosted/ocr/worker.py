"""Database-backed queue: claim atomically, retain page coordinates, require human review."""
import json
import logging
import os
from pathlib import Path
import time
import importlib.metadata
import uuid
import tempfile
from extraction import candidates
import psycopg
from psycopg.rows import dict_row
import pypdfium2 as pdfium
from PIL import Image

logging.basicConfig(level=logging.INFO)
ROOT = Path(os.environ.get('STORAGE_DIR', '../storage/documents')).resolve()
ENGINE = None
MAX_PAGES = 50

def engine():
    global ENGINE
    if ENGINE is None:
        from paddleocr import PaddleOCR
        ENGINE = PaddleOCR(text_detection_model_name=os.getenv('OCR_DET_MODEL','PP-OCRv6_small_det'), text_recognition_model_name=os.getenv('OCR_REC_MODEL','PP-OCRv6_small_rec'), enable_mkldnn=False, cpu_threads=int(os.getenv('OCR_CPU_THREADS','2')), use_doc_orientation_classify=False,
                           use_doc_unwarping=False, use_textline_orientation=False)
    return ENGINE

def image_result(image):
    import numpy as np
    results = engine().predict(np.array(image.convert('RGB')))
    pages = []
    for result in results:
        value = result.json
        if isinstance(value, str):
            value = json.loads(value)
        # PaddleOCR JSON contains rec_texts, rec_scores, and rec_polys.
        pages.append(value)
    return pages

def extract(path: Path, mime: str):
    pages = []
    if mime == 'application/pdf':
        pdf = pdfium.PdfDocument(path)
        try:
            if len(pdf) > MAX_PAGES:
                raise ValueError('PDF exceeds 50-page limit')
            for index in range(len(pdf)):
                page = pdf[index]
                try:
                    textpage = page.get_textpage()
                    try:
                        if textpage.count_chars() > 50000:
                            raise ValueError('PDF page text limit exceeded')
                        text = textpage.get_text_bounded()
                        if text.strip():
                            lines, chars, boxes = [], [], []
                            def flush():
                                if chars:
                                    bounds = [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)] if boxes else None
                                    lines.append({'text': ''.join(chars), 'box': bounds})
                                    chars.clear()
                                    boxes.clear()
                            for offset in range(textpage.count_chars()):
                                character = textpage.get_text_range(offset, 1)
                                if character == '\n':
                                    flush()
                                elif character != '\r':
                                    chars.append(character)
                                    boxes.append(textpage.get_charbox(offset))
                            flush()
                            pages.append({'page': index + 1, 'source': 'pdf_text', 'text': text, 'lines': lines, 'coordinate_system': 'pdf_points_bottom_left'})
                            continue
                    finally:
                        textpage.close()
                    width, height = page.get_size()
                    if width * height * 4 > 25_000_000:
                        raise ValueError('Rendered PDF exceeds image pixel limit')
                    bitmap = page.render(scale=2)
                    try:
                        image = bitmap.to_pil().copy()
                        pages.append({'page': index + 1, 'source': 'ocr', 'coordinate_system': 'image_pixels_top_left', 'result': image_result(image)})
                        image.close()
                    finally:
                        bitmap.close()
                finally:
                    page.close()
        finally:
            pdf.close()
    else:
        Image.MAX_IMAGE_PIXELS = 25_000_000
        with Image.open(path) as image:
            if image.width * image.height > 25_000_000:
                raise ValueError('Image pixel limit exceeded')
            pages.append({'page': 1, 'source': 'ocr', 'coordinate_system': 'image_pixels_top_left', 'result': image_result(image)})
    return {'engine': 'PaddleOCR', 'version': importlib.metadata.version('paddleocr'), 'models': {'detection': os.getenv('OCR_DET_MODEL', 'PP-OCRv6_small_det'), 'recognition': os.getenv('OCR_REC_MODEL', 'PP-OCRv6_small_rec')}, 'pages': pages, 'requires_human_review': True}


def run_once(connection):
    lease = uuid.uuid4()
    with connection.transaction():
        job = connection.execute("""UPDATE documents SET status='processing', claimed_at=now(), attempts=attempts+1,lease_token=%s
          WHERE id=(SELECT id FROM documents WHERE status='queued' AND attempts<3 AND deleted_at IS NULL
          ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *""",(lease,)).fetchone()
    if not job:
        return False
    try:
        path = (ROOT / job['storage_key']).resolve()
        if path.parent != ROOT:
            raise ValueError('Invalid storage key')
        if os.getenv('S3_BUCKET'):
            import boto3
            with tempfile.TemporaryDirectory() as directory:
                path=Path(directory)/job['storage_key']
                boto3.client('s3',endpoint_url=os.getenv('S3_ENDPOINT')).download_file(os.environ['S3_BUCKET'],job['storage_key'],str(path))
                import hashlib
                if hashlib.sha256(path.read_bytes()).hexdigest()!=job['checksum']:raise ValueError('Checksum mismatch')
                output=extract(path,job['mime_type'])
        else:
            import hashlib
            if hashlib.sha256(path.read_bytes()).hexdigest()!=job['checksum']:raise ValueError('Checksum mismatch')
            output = extract(path, job['mime_type'])
        evidence=candidates(output)
        output.update(evidence)
        connection.execute("UPDATE documents SET status='needs_review',extracted_data=%s,raw_text=%s,category=%s,error=NULL,revision=revision+1 WHERE id=%s AND lease_token=%s AND deleted_at IS NULL", (json.dumps(output),evidence['raw_text'],evidence['category'], job['id'],lease))
        logging.info('OCR completed: %s', job['id'])
    except Exception:
        logging.exception('OCR failed: %s', job['id'])
        connection.execute("UPDATE documents SET status=CASE WHEN attempts<3 THEN 'queued' ELSE 'failed' END,error='OCR processing failed. Check worker logs.',lease_token=NULL WHERE id=%s AND lease_token=%s AND deleted_at IS NULL", (job['id'],lease))
    return True

if __name__ == '__main__':
    while True:
        try:
            with psycopg.connect(os.environ['DATABASE_URL'], autocommit=True, row_factory=dict_row) as connection:
                while True:
                    connection.execute("UPDATE documents SET status=CASE WHEN attempts<3 THEN 'queued' ELSE 'failed' END,lease_token=NULL WHERE status='processing' AND claimed_at<now()-interval '30 minutes' AND deleted_at IS NULL")
                    if not run_once(connection):
                        time.sleep(3)
        except Exception:
            logging.exception('Worker connection failed; retrying in 10 seconds')
            time.sleep(10)
