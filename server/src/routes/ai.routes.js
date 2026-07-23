import { Router } from 'express';
import { aiService } from '../services/aiService.js';

const router = Router();

router.post('/generate', async (req, res) => {
  try {
    const { prompt, toolId } = req.body;
    const result = await aiService.generate({ prompt, toolId });
    return res.json(result);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      provider: null,
      error: err.message || 'AI generation failed. Please try again.',
      code: err.code || `HTTP_${status}`
    });
  }
});

export default router;
