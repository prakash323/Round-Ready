import { Types } from "mongoose";
import { Note } from "../models/Note";
import { sessionOf } from "../middleware/requireAuth";
import { asyncHandler, notFound } from "../middleware/errorHandler";
import type { NoteInput } from "../lib/schemas";

/**
 * A student's notes.
 *
 * Every query is filtered by `userId`, never by id alone. That is the whole
 * of the authorisation here, and it is why a note belonging to someone else
 * is a 404 rather than a 403 — a 403 would confirm the id exists.
 *
 * Notes are the one thing in this app that cannot be recomputed if lost, so
 * nothing outside these handlers ever writes to a note body.
 */

function objectId(value: string): Types.ObjectId | null {
  return Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : null;
}

/** Escapes a user string for safe use inside a RegExp. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The note list.
 *
 * Returns everything but the body — a sidebar needs titles and a preview, not
 * fifty thousand characters per row. A short excerpt is sent instead so the
 * list can show a second line without a second request per note.
 */
export const listNotes = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const userId = new Types.ObjectId(session.userId);

  const query = String(req.query.q ?? "").trim();
  const folder = String(req.query.folder ?? "").trim();
  const tag = String(req.query.tag ?? "").trim();

  const filter: Record<string, unknown> = { userId };
  if (folder) filter.folder = folder;
  if (tag) filter.tags = tag;
  if (query) {
    // A plain case-insensitive match rather than $text: it finds partial
    // words, which is what someone typing three letters into a search box
    // expects, and $text would not match "hash" against "hashing".
    const pattern = new RegExp(escapeRegex(query), "i");
    filter.$or = [{ title: pattern }, { body: pattern }, { tags: pattern }];
  }

  const docs = await Note.find(filter)
    .sort({ pinned: -1, updatedAt: -1 })
    .select("title folder tags pinned skillLabel updatedAt createdAt body")
    .limit(300)
    .lean();

  res.json({
    notes: docs.map(({ body, ...rest }) => ({
      ...rest,
      // Enough for one line in the list, and no more over the wire.
      excerpt: body.replace(/[#*`>_-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140),
    })),
  });
});

export const getNote = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const id = objectId(req.params.id);
  if (!id) throw notFound("No such note");

  const doc = await Note.findOne({ _id: id, userId: new Types.ObjectId(session.userId) }).lean();
  if (!doc) throw notFound("No such note");
  res.json({ note: doc });
});

export const createNote = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const input = req.body as NoteInput;

  const doc = await Note.create({ ...input, userId: new Types.ObjectId(session.userId) });
  res.status(201).json({ note: doc.toObject() });
});

/**
 * Save a note.
 *
 * This is what autosave calls, so it is a full replace of the fields the
 * editor owns rather than a merge — the client holds the authoritative copy
 * while the student is typing in it. The response carries the saved document
 * back, including its new `updatedAt`, because the editor must not claim a
 * note is saved until the server says it is.
 */
export const updateNote = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const id = objectId(req.params.id);
  if (!id) throw notFound("No such note");

  const input = req.body as NoteInput;
  const doc = await Note.findOneAndUpdate(
    { _id: id, userId: new Types.ObjectId(session.userId) },
    { $set: { ...input } },
    { new: true },
  ).lean();

  if (!doc) throw notFound("No such note");
  res.json({ note: doc });
});

export const deleteNote = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const id = objectId(req.params.id);
  if (!id) throw notFound("No such note");

  const doc = await Note.findOneAndDelete({
    _id: id,
    userId: new Types.ObjectId(session.userId),
  }).lean();

  if (!doc) throw notFound("No such note");
  res.json({ deleted: true });
});
