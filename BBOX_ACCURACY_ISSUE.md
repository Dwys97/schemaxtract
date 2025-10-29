# Why Rossum's Bboxes Are Better

## The Problem with Current Implementation

Your current code does this:

```python
# Step 1: Ask LayoutLM for answer
result = doc_qa(image=image, question="What is the vendor name?")
# Returns: {'answer': 'Wilkinson Sword GmbH', 'score': 0.92, 'start': 10, 'end': 13}

# Step 2: Run separate OCR
ocr_words = perform_ocr_get_words(image_path)  # Tesseract OCR

# Step 3: Try to match answer to OCR words (INACCURATE!)
bbox_match = match_value_to_ocr_bbox(answer, ocr_words, img_width, img_height)
```

**This is why bboxes don't fit well!**

LayoutLM uses its own internal OCR (LayoutLMv2/v3 has built-in OCR), but you're running Tesseract separately and trying to match the strings. The two OCR engines might:
- Recognize words differently
- Split text differently  
- Have different confidence levels
- Return slightly different bboxes

## How Rossum Does It (Better)

Rossum uses LayoutLM's **native word-level outputs**:

```python
# LayoutLM internally:
# 1. Runs OCR to get words + bboxes
# 2. Processes with transformer
# 3. Returns answer WITH the word indices

result = doc_qa(
    image=image, 
    question="What is the vendor name?",
    return_dict_in_generate=True,  # Get detailed output
    output_attentions=True          # Get attention weights
)

# Result includes:
# - answer: "Wilkinson Sword GmbH"
# - start/end: token positions in the document
# - word_ids: [45, 46, 47]  ← These map to LayoutLM's internal OCR words!
```

Then they extract bbox from LayoutLM's own OCR results:

```python
# Get LayoutLM's OCR words (it did OCR internally!)
layout_words = processor.tokenizer.convert_ids_to_tokens(input_ids)
layout_boxes = encoding['bbox']  # Already has bboxes!

# Extract bbox for answer
answer_word_ids = result['word_ids']
answer_boxes = [layout_boxes[i] for i in answer_word_ids]
merged_bbox = merge_boxes(answer_boxes)  # Perfect fit!
```

## The Fix: Use LayoutLM's Native Bboxes

Instead of running separate OCR, we should use LayoutLM's internal word representations:

```python
from transformers import LayoutLMv2Processor, LayoutLMv2ForQuestionAnswering
from PIL import Image

# Load processor (handles OCR + tokenization)
processor = LayoutLMv2Processor.from_pretrained("impira/layoutlm-invoices")
model = LayoutLMv2ForQuestionAnswering.from_pretrained("impira/layoutlm-invoices")

# Process image (LayoutLM does OCR internally!)
image = Image.open(image_path).convert("RGB")
question = "What is the vendor name?"

encoding = processor(
    image, 
    question, 
    return_tensors="pt",
    return_offsets_mapping=True  # Maps tokens to character positions
)

# encoding now contains:
# - input_ids: tokenized text
# - bbox: bounding boxes for each token (LayoutLM's OCR!)
# - attention_mask: valid tokens
# - offset_mapping: character positions

# Run model
outputs = model(**encoding)
start_idx = torch.argmax(outputs.start_logits)
end_idx = torch.argmax(outputs.end_logits)

# Extract answer AND bbox directly from LayoutLM's data
answer_token_ids = encoding['input_ids'][0][start_idx:end_idx+1]
answer_text = processor.tokenizer.decode(answer_token_ids)

# Get bbox from LayoutLM's OCR (not separate Tesseract!)
answer_bboxes = encoding['bbox'][0][start_idx:end_idx+1]
merged_bbox = {
    'x1': min(box[0] for box in answer_bboxes),
    'y1': min(box[1] for box in answer_bboxes),
    'x2': max(box[2] for box in answer_bboxes),
    'y2': max(box[3] for box in answer_bboxes)
}
```

**Result: Perfect bbox alignment because it's from the same OCR source!**

## Why This Matters

### Current Approach (Inaccurate):
1. LayoutLM runs OCR internally → "Wilkinson Sword GmbH"
2. You run Tesseract separately → "Wilkinson-Sword GmbH" (hyphen!)
3. String matching fails or returns wrong bbox
4. Bbox doesn't fit the actual text

### Correct Approach (Like Rossum):
1. LayoutLM runs OCR internally → gets words + bboxes
2. LayoutLM finds answer in its own OCR words
3. Return the SAME bboxes LayoutLM used
4. Perfect alignment!

## Implementation Priority

### Option 1: Use LayoutLM Processor Directly (Best Quality)
```python
# Use processor instead of pipeline
processor = LayoutLMv2Processor.from_pretrained("impira/layoutlm-invoices")
model = LayoutLMv2ForQuestionAnswering.from_pretrained("impira/layoutlm-invoices")

# Get bboxes directly from LayoutLM's OCR
encoding = processor(image, question, return_tensors="pt")
# encoding['bbox'] contains LayoutLM's OCR bboxes
```

**Pros:** 
- Perfect bbox alignment
- No separate OCR needed
- Faster (one OCR pass instead of two)
- Same quality as Rossum

**Cons:**
- Need to refactor from pipeline to processor/model
- More code to handle tokenization

### Option 2: Improve OCR Matching (Quick Fix)
Keep current architecture but improve the matching:

```python
def match_value_to_ocr_bbox_improved(value, ocr_words, img_width, img_height):
    """
    Better OCR matching with:
    - Fuzzy string matching (Levenshtein distance)
    - Multi-word sequence detection
    - Character-level alignment
    """
    from difflib import SequenceMatcher
    
    value_clean = value.lower().strip()
    best_match = None
    best_ratio = 0
    
    # Try to find contiguous sequence of OCR words
    for i in range(len(ocr_words)):
        for j in range(i+1, min(i+10, len(ocr_words)+1)):
            ocr_sequence = " ".join(w["text"] for w in ocr_words[i:j])
            ratio = SequenceMatcher(None, value_clean, ocr_sequence.lower()).ratio()
            
            if ratio > best_ratio and ratio > 0.7:  # 70% similarity threshold
                best_ratio = ratio
                best_match = ocr_words[i:j]
    
    if best_match:
        # Merge bboxes of best matching sequence
        x1 = min(w["bbox"][0] for w in best_match)
        y1 = min(w["bbox"][1] for w in best_match)
        x2 = max(w["bbox"][2] for w in best_match)
        y2 = max(w["bbox"][3] for w in best_match)
        avg_conf = sum(w["confidence"] for w in best_match) / len(best_match)
        
        return {"bbox": [x1, y1, x2, y2], "confidence": avg_conf}
    
    return {"bbox": [0, 0, 100, 100], "confidence": 0.3}
```

**Pros:**
- Quick to implement
- Works with current architecture
- Better than current matching

**Cons:**
- Still not as accurate as using LayoutLM's native bboxes
- Two OCR passes = slower

### Option 3: Use LayoutLM's `word_ids` (Middle Ground)

The `pipeline` API might expose word_ids:

```python
result = doc_qa(
    image=image, 
    question=question,
    top_k=1,
    handle_impossible_answer=False
)

# Check if result has word_ids or token information
if 'word_ids' in result or hasattr(result, 'word_ids'):
    # Use LayoutLM's word indices to get bboxes
    word_ids = result['word_ids']
    # Map to LayoutLM's internal OCR words
```

## Recommendation

**Implement Option 1** (use LayoutLM processor directly) for production quality matching Rossum.

This requires refactoring `extract_invoice_fields_layoutlm` to:
1. Use `LayoutLMv2Processor` instead of `pipeline`
2. Extract bboxes from `encoding['bbox']` 
3. Map answer tokens to bbox coordinates
4. Remove separate Tesseract OCR call

The bbox quality will immediately match Rossum because you'll be using the same approach: **extracting bboxes from the same OCR source the model used**.

Would you like me to implement this refactoring?
