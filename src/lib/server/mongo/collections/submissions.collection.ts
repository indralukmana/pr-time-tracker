import type { OptionalId } from 'mongodb';

import { BaseCollection } from './base.collection';
import { items } from './items.collection';

import { Approval, CollectionNames, Experience, type SubmissionSchema } from '$lib/@types';

export class SubmissionsCollection extends BaseCollection<SubmissionSchema> {
  async create({ item_id, owner_id, ...resource }: OptionalId<Omit<SubmissionSchema, 'approval'>>) {
    const item = await items.getOne({ id: item_id });

    if (!item) throw Error(`Item with ID, ${item_id}, not found. Submission declined.`);

    if (await this.getOne({ item_id, owner_id })) {
      throw Error(
        `Submission with item ID, ${item_id}, already exists for contributor, ${owner_id}.`
      );
    }

    const created_at = new Date().toISOString();
    const submission = await super.create({
      item_id,
      owner_id,
      ...resource,
      approval: Approval.PENDING,
      created_at,
      updated_at: created_at
    });

    await items.updateSubmissions(item_id, submission._id);

    return submission;
  }
}

export const submissions = new SubmissionsCollection(CollectionNames.SUBMISSIONS, {
  required: ['experience', 'hours', 'owner_id', 'item_id', 'created_at', 'updated_at', 'approval'],
  properties: {
    approval: {
      enum: Object.values(Approval),
      description: 'must be one of the enum values.'
    },
    experience: {
      bsonType: 'string',
      enum: Object.values(Experience),
      description: 'must be one of the enum values.'
    },
    hours: {
      bsonType: 'int',
      description: 'must be provided.'
    },
    item_id: {
      bsonType: 'int',
      description: 'must be provided.'
    },
    owner_id: {
      bsonType: 'int',
      description: 'must be provided.'
    },
    created_at: {
      bsonType: 'string',
      description: 'must be provided.'
    },
    updated_at: {
      bsonType: 'string',
      description: 'must be provided.'
    }
  }
});
