import { initDataset, type Dataset } from "braintrust";

// Used for evals. Not used in production.
export class Braintrust {
  private dataset: Dataset | null = null;

  constructor(dataset: string) {
    if (process.env.BRAINTRUST_API_KEY) {
      this.dataset = initDataset("inbox-zero", { dataset });
    }
  }

  insertToDataset(data: { id: string; input: unknown; expected?: unknown }) {
    if (!this.dataset) return;

    try {
      this.dataset.insert(data);
    } catch (error) {
      console.error(error);
    }
  }
}
