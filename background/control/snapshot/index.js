import { SnapshotFormatter } from './formatter.js';

/**
 * Handles Accessibility Tree generation and UID mapping.
 * Converts complex DOM structures into an LLM-friendly, token-efficient text tree.
 */
export class SnapshotManager {
    constructor(connection) {
        this.connection = connection;
        this.snapshotMap = new Map(); // Maps uid -> backendNodeId
        this.uidToAxNode = new Map(); // Maps uid -> AXNode (raw)
        this.uidToNodeId = new Map(); // Maps uid -> AX nodeId
        this.nodeIdToUid = new Map(); // Maps AX nodeId -> uid
        this.axNodeByNodeId = new Map(); // Maps AX nodeId -> AXNode (raw)
        this.snapshotIdCount = 0;

        // Listen to connection detach to clear state
        this.connection.onDetach(() => this.clear());
    }

    clear() {
        this.snapshotMap.clear();
        this.uidToAxNode.clear();
        this.uidToNodeId.clear();
        this.nodeIdToUid.clear();
        this.axNodeByNodeId.clear();
    }

    getBackendNodeId(uid) {
        // UIDs are formatted as "{snapshotId}_{nodeIndex}"
        if (uid && uid.includes('_')) {
            const parts = uid.split('_');
            const snapshotVersion = parseInt(parts[0], 10);

            if (!isNaN(snapshotVersion) && snapshotVersion !== this.snapshotIdCount) {
                throw new Error(
                    `Stale Element Reference: UID '${uid}' belongs to an older snapshot (v${snapshotVersion}). The current page state is v${this.snapshotIdCount}. You MUST call 'take_snapshot' to get fresh UIDs.`
                );
            }
        }

        const id = this.snapshotMap.get(uid);
        if (!id) {
            // If ID matches current version but not found in map, it's likely invalid or ephemeral
            throw new Error(
                `Element '${uid}' not found in current snapshot. Please verify the UID or take a new snapshot.`
            );
        }
        return id;
    }

    getAXNode(uid) {
        return this.uidToAxNode.get(uid);
    }

    _getVal(prop) {
        return prop && prop.value;
    }

    /**
     * Traverses descendants of a node using the raw AX tree structure.
     */
    findDescendant(rootUid, predicate) {
        const rootNodeId = this.uidToNodeId.get(rootUid);
        if (!rootNodeId) return null;

        const visit = (nodeId) => {
            const node = this.axNodeByNodeId.get(nodeId);
            if (!node || !Array.isArray(node.childIds)) return null;

            for (const childId of node.childIds) {
                const childNode = this.axNodeByNodeId.get(childId);
                const childUid = this.nodeIdToUid.get(childId);
                if (childNode && childUid && predicate(childNode, childUid)) {
                    return childUid;
                }

                const descendantUid = visit(childId);
                if (descendantUid) return descendantUid;
            }

            return null;
        };

        return visit(rootNodeId);
    }

    async takeSnapshot(args = {}) {
        // Ensure domains are enabled
        await this.connection.sendCommand('DOM.enable');
        await this.connection.sendCommand('Accessibility.enable');

        // Get the full accessibility tree from CDP
        const { nodes } = await this.connection.sendCommand('Accessibility.getFullAXTree');

        // Increment Snapshot ID (Version Control)
        this.snapshotIdCount++;

        // Clear maps
        this.clear();
        nodes.forEach((node) => {
            if (node.nodeId) this.axNodeByNodeId.set(node.nodeId, node);
        });

        const formatter = new SnapshotFormatter({
            verbose: args.verbose === true,
            snapshotPrefix: this.snapshotIdCount,
            onNode: (node, uid) => {
                if (node.backendDOMNodeId) {
                    this.snapshotMap.set(uid, node.backendDOMNodeId);
                }
                this.uidToAxNode.set(uid, node);
                if (node.nodeId) {
                    this.uidToNodeId.set(uid, node.nodeId);
                    this.nodeIdToUid.set(node.nodeId, uid);
                }
            },
        });

        return formatter.format(nodes);
    }
}
