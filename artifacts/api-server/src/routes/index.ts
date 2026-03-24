import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import modelsRouter from "./models";
import adminRouter from "./admin";
import publicRouter from "./public";
import feedbackRouter from "./feedback";
import errorsRouter from "./errors";

const router: IRouter = Router();

router.use(healthRouter);
router.use(publicRouter);
router.use(feedbackRouter);
router.use(errorsRouter);
router.use(authRouter);
router.use(modelsRouter);
router.use(adminRouter);

export default router;
