import { createUploadthing, type FileRouter } from "uploadthing/server";
import { auth } from "@clerk/nextjs/server";

const f = createUploadthing();

export const ourFileRouter = {
  organizationLogo: f({ image: { maxFileSize: "2MB", maxFileCount: 1 } })
    .middleware(async () => {
      const { userId } = await auth();
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Organization logo uploaded by:", metadata.userId);
      return { url: file.ufsUrl };
    }),

  bulkExerciseVideos: f({ video: { maxFileSize: "64MB", maxFileCount: 30 } })
    .middleware(async () => {
      const { userId } = await auth();
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Bulk exercise video uploaded by:", metadata.userId);
      return { url: file.ufsUrl, name: file.name };
    }),

  exerciseVideo: f({ video: { maxFileSize: "64MB", maxFileCount: 1 } })
    .middleware(async () => {
      const { userId } = await auth();
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Exercise video uploaded by:", metadata.userId);
      return { url: file.ufsUrl };
    }),

  exerciseImage: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async () => {
      const { userId } = await auth();
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Exercise image uploaded by:", metadata.userId);
      return { url: file.ufsUrl };
    }),

  progressPhoto: f({ image: { maxFileSize: "8MB", maxFileCount: 1 } })
    .middleware(async () => {
      const { userId } = await auth();
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Progress photo uploaded by:", metadata.userId);
      return { url: file.ufsUrl };
    }),

  programBrief: f({
    pdf: { maxFileSize: "4MB", maxFileCount: 1 },
    text: { maxFileSize: "1MB", maxFileCount: 1 },
    blob: { maxFileSize: "4MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const { userId } = await auth();
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Program brief uploaded by:", metadata.userId);
      return { url: file.ufsUrl, name: file.name };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
