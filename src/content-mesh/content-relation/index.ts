import { ContentCollection } from '../content-collection';
import { ContentNode } from '../content-node';
import { ContentMesh } from '..';
import { NodeRelation } from '../node-relation';

export interface ContentRelationConfig {
  srcField: string | void;
  srcTable: ContentCollection;

  destField: string | void;
  destTable: ContentCollection;

  mesh: ContentMesh;
}

export abstract class ContentRelation {
  protected _srcField: string | void;
  protected _srcTable: ContentCollection;

  protected _destField: string | void;
  protected _destTable: ContentCollection;

  protected _mesh: ContentMesh;

  constructor(config: ContentRelationConfig) {
    this._srcField = config.srcField;
    this._srcTable = config.srcTable;

    this._destField = config.destField;
    this._destTable = config.destTable;

    this._mesh = config.mesh;
  }

  protected abstract _resolveNodeRelation(
    node: ContentNode,
    tableType: 'src' | 'dest',
  ): void | ContentNode | ContentNode[];

  protected _updateTable(table: ContentCollection, tableType: 'src' | 'dest'): void {
    if (!table.acceptsRelations()) return;

    const field = tableType === 'src' ? this._srcField : this._destField;

    if (!field) return;

    table.getNodes().forEach((node) => {
      const related = this._resolveNodeRelation(node, tableType);

      if (related) {
        node.addRelation(
          new NodeRelation({
            field,
            related,
          }),
        );
      }
    });
  }

  public applyRecordUpdates(): void {
    this._updateTable(this._destTable, 'dest');

    if (!this._isSelfJoin()) {
      this._updateTable(this._srcTable, 'src');
    }
  }

  protected _isSelfJoin(): boolean {
    return this._srcTable.name === this._destTable.name;
  }
}

export { SimpleContentRelation, SimpleContentRelationConfig } from './simple-relation';
export { JunctionContentRelation, JunctionContentRelationConfig } from './junction-relation';
export { FileContentRelation, FileContentRelationConfig } from './file-relation';
