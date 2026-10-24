import { Schema, Types, model } from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

/**
 * A note the student wrote.
 *
 * Like a study task and unlike every verdict in this app, this is primary
 * data: it cannot be recomputed from anything, and losing it loses something
 * nobody can give back. That shapes every decision here — ownership is
 * enforced on every query, deletion is explicit, and nothing in the
 * preparation flow is ever allowed to overwrite a note's body.
 *
 * The body is stored as Markdown text and never as HTML. The client renders
 * it by parsing into React elements rather than injecting markup, so a note
 * containing a script tag is a note containing the words "script tag".
 */
const noteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: "", maxlength: 50_000 },

    /** A flat folder name. Not a tree: a placement season is eight weeks. */
    folder: { type: String, default: null, trim: true, maxlength: 60 },
    tags: { type: [String], default: () => [] },

    /** Pinned notes sort first, whatever their update time. */
    pinned: { type: Boolean, default: false },

    /**
     * What this note is about. All optional, and all plain references — a
     * note survives the thing it points at being deleted, because the writing
     * is the student's and the drive was only ever the occasion for it.
     */
    driveId: { type: Schema.Types.ObjectId, ref: "Drive", default: null },
    jobDescriptionId: { type: Schema.Types.ObjectId, ref: "JobDescription", default: null },
    studyTaskId: { type: Schema.Types.ObjectId, ref: "StudyTask", default: null },
    skillId: { type: String, default: null, trim: true, maxlength: 60 },
    skillLabel: { type: String, default: null, trim: true, maxlength: 80 },
  },
  { timestamps: { createdAt: true, updatedAt: true }, versionKey: false },
);

// The list is one student's notes, newest first, pinned above the rest.
noteSchema.index({ userId: 1, pinned: -1, updatedAt: -1 }, { name: "owner_recent" });
// Search runs over the title and body of one student's own notes only.
noteSchema.index({ userId: 1, title: "text", body: "text" }, { name: "owner_text" });

export type NoteDoc = InferSchemaType<typeof noteSchema> & { _id: Types.ObjectId };

export const Note: Model<NoteDoc> = model<NoteDoc>("Note", noteSchema);
