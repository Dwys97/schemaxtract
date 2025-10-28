/**
 * Batch Annotation Service
 * Handles progressive field extraction in batches to avoid CPU overload
 * Processes priority (required) fields first, then optional fields
 */

// Use the proxied API route for progressive batch extraction
const BATCH_EXTRACT_URL = "/api/extract-batch";
const BATCH_SIZE = 5; // Process 5 questions at a time
const BATCH_DELAY_MS = 500; // Wait 0.5s between batches

export class BatchAnnotationService {
  constructor() {
    this.onBatchComplete = null; // Callback(batchFields, batchInfo)
    this.onAllComplete = null; // Callback(allFields)
    this.onError = null; // Callback(error)
    this.onProgress = null; // Callback(progressInfo)
  }

  /**
   * Extract fields in batches with priority ordering
   * @param {string} base64Image - Base64 encoded document
   * @param {string} format - Document format (pdf, png, jpg)
   * @param {Array} customFields - Field definitions with questions
   * @param {Object} options - Configuration options
   */
  async extractInBatches(base64Image, format, customFields, options = {}) {
    const {
      batchSize = BATCH_SIZE,
      delayMs = BATCH_DELAY_MS,
      startFromBatch = 0,
      templateHints = null, // Template hints for few-shot learning
    } = options;

    try {
      console.log("[BatchAnnotation] Starting batch extraction:", {
        totalFields: customFields.length,
        batchSize,
        startFromBatch,
        hasTemplateHints: !!templateHints,
      });

      if (templateHints) {
        console.log(`[BatchAnnotation] Using template: ${templateHints.template_name} with ${templateHints.field_hints.length} hints`);
      }

      // Sort fields: required first (priority), then optional
      const priorityFields = customFields.filter((f) => f.required === true);
      const optionalFields = customFields.filter((f) => f.required !== true);
      const sortedFields = [...priorityFields, ...optionalFields];

      console.log("[BatchAnnotation] Field priority:", {
        required: priorityFields.length,
        optional: optionalFields.length,
      });

      const totalBatches = Math.ceil(sortedFields.length / batchSize);
      const allExtractedFields = [];

      // Process each batch
      for (
        let batchIndex = startFromBatch;
        batchIndex < totalBatches;
        batchIndex++
      ) {
        const isPriorityBatch = batchIndex === 0; // First batch has priority fields

        console.log(
          `[BatchAnnotation] Processing batch ${
            batchIndex + 1
          }/${totalBatches}` +
            (isPriorityBatch ? " (PRIORITY BATCH - Required Fields)" : "")
        );

        // Notify progress
        if (this.onProgress) {
          this.onProgress({
            batchIndex,
            totalBatches,
            processedFields: allExtractedFields.length,
            totalFields: sortedFields.length,
            isPriorityBatch,
            percentComplete: Math.round((batchIndex / totalBatches) * 100),
          });
        }

        try {
          // Call batch extraction endpoint with template hints
          const response = await fetch(BATCH_EXTRACT_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              image: base64Image,
              format,
              custom_fields: sortedFields, // Send all, backend will slice
              batch_size: batchSize,
              batch_index: batchIndex,
              template_hints: templateHints, // Pass template hints for few-shot learning
            }),
          });

          if (!response.ok) {
            throw new Error(
              `Batch ${batchIndex} failed: ${response.statusText}`
            );
          }

          const result = await response.json();

          if (result.status !== "success") {
            throw new Error(result.error || "Batch extraction failed");
          }

          const batchFields = result.fields || [];
          const batchInfo = result.batch_info || {};

          console.log(`[BatchAnnotation] Batch ${batchIndex + 1} completed:`, {
            fieldsExtracted: batchFields.length,
            hasMore: batchInfo.has_more,
          });

          // Add to collected fields
          allExtractedFields.push(...batchFields);

          // Notify batch completion
          if (this.onBatchComplete) {
            this.onBatchComplete(batchFields, {
              ...batchInfo,
              isPriorityBatch,
              totalExtracted: allExtractedFields.length,
            });
          }

          // Wait between batches (except after last batch)
          if (batchInfo.has_more && delayMs > 0) {
            console.log(
              `[BatchAnnotation] Waiting ${delayMs}ms before next batch...`
            );
            await this.delay(delayMs);
          }
        } catch (error) {
          console.error(`[BatchAnnotation] Batch ${batchIndex} error:`, error);

          if (this.onError) {
            this.onError({
              message: error.message,
              batchIndex,
              partialResults: allExtractedFields,
            });
          }

          // Continue with next batch or stop?
          // For now, we'll stop on error
          throw error;
        }
      }

      console.log("[BatchAnnotation] All batches complete:", {
        totalExtracted: allExtractedFields.length,
        totalBatches,
      });

      // Notify completion
      if (this.onAllComplete) {
        this.onAllComplete(allExtractedFields);
      }

      return {
        status: "success",
        fields: allExtractedFields,
        batchesProcessed: totalBatches,
      };
    } catch (error) {
      console.error("[BatchAnnotation] Extraction failed:", error);

      if (this.onError && !error.partialResults) {
        this.onError({
          message: error.message,
          partialResults: [],
        });
      }

      throw error;
    }
  }

  /**
   * Helper to delay execution
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Cancel ongoing batch processing (if needed in future)
   */
  cancel() {
    // TODO: Implement cancellation logic if needed
    console.log("[BatchAnnotation] Cancellation not yet implemented");
  }
}

export default new BatchAnnotationService();
