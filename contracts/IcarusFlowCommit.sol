// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IcarusFlowCommit
 * @notice Smart contract for immutable workflow state commitments on WeilChain
 * @dev Stores workflow execution proofs and audit log hashes
 */
contract IcarusFlowCommit {
    
    struct WorkflowCommit {
        bytes32 workflowHash;      // Hash of the entire workflow
        bytes32 stateRoot;         // Merkle root of task outputs
        bytes32 auditLogHash;      // Hash of the audit log
        uint256 taskCount;         // Number of tasks executed
        uint256 timestamp;         // Block timestamp
        address executor;          // Address that executed the workflow
        bool exists;               // Whether this commit exists
    }
    
    // flowId => WorkflowCommit
    mapping(string => WorkflowCommit) public commits;
    
    // All flow IDs for enumeration
    string[] public flowIds;
    
    // Events
    event WorkflowCommitted(
        string indexed flowId,
        bytes32 workflowHash,
        bytes32 stateRoot,
        bytes32 auditLogHash,
        uint256 taskCount,
        address executor,
        uint256 timestamp
    );
    
    event WorkflowVerified(
        string indexed flowId,
        bool valid,
        address verifier,
        uint256 timestamp
    );
    
    /**
     * @notice Commit a workflow execution to the chain
     * @param flowId Unique identifier for the workflow
     * @param workflowHash Hash of the complete workflow
     * @param stateRoot Merkle root of all task output hashes
     * @param auditLogHash Hash of the audit log entries
     * @param taskCount Number of tasks in the workflow
     */
    function commitWorkflow(
        string calldata flowId,
        bytes32 workflowHash,
        bytes32 stateRoot,
        bytes32 auditLogHash,
        uint256 taskCount
    ) external {
        require(!commits[flowId].exists, "Workflow already committed");
        require(bytes(flowId).length > 0, "Flow ID cannot be empty");
        require(workflowHash != bytes32(0), "Workflow hash cannot be empty");
        
        commits[flowId] = WorkflowCommit({
            workflowHash: workflowHash,
            stateRoot: stateRoot,
            auditLogHash: auditLogHash,
            taskCount: taskCount,
            timestamp: block.timestamp,
            executor: msg.sender,
            exists: true
        });
        
        flowIds.push(flowId);
        
        emit WorkflowCommitted(
            flowId,
            workflowHash,
            stateRoot,
            auditLogHash,
            taskCount,
            msg.sender,
            block.timestamp
        );
    }
    
    /**
     * @notice Verify a workflow execution against stored commitment
     * @param flowId The workflow ID to verify
     * @param expectedHash The expected workflow hash
     * @return valid Whether the hashes match
     */
    function verifyWorkflow(
        string calldata flowId,
        bytes32 expectedHash
    ) external returns (bool valid) {
        WorkflowCommit storage commit = commits[flowId];
        require(commit.exists, "Workflow not found");
        
        valid = commit.workflowHash == expectedHash;
        
        emit WorkflowVerified(flowId, valid, msg.sender, block.timestamp);
        
        return valid;
    }
    
    /**
     * @notice Get workflow commitment details
     * @param flowId The workflow ID to query
     */
    function getCommit(string calldata flowId) external view returns (
        bytes32 workflowHash,
        bytes32 stateRoot,
        bytes32 auditLogHash,
        uint256 taskCount,
        uint256 timestamp,
        address executor
    ) {
        WorkflowCommit storage commit = commits[flowId];
        require(commit.exists, "Workflow not found");
        
        return (
            commit.workflowHash,
            commit.stateRoot,
            commit.auditLogHash,
            commit.taskCount,
            commit.timestamp,
            commit.executor
        );
    }
    
    /**
     * @notice Check if a workflow exists
     * @param flowId The workflow ID to check
     */
    function exists(string calldata flowId) external view returns (bool) {
        return commits[flowId].exists;
    }
    
    /**
     * @notice Get total number of committed workflows
     */
    function getTotalCommits() external view returns (uint256) {
        return flowIds.length;
    }
    
    /**
     * @notice Get flow ID at index (for enumeration)
     * @param index The index to query
     */
    function getFlowIdAtIndex(uint256 index) external view returns (string memory) {
        require(index < flowIds.length, "Index out of bounds");
        return flowIds[index];
    }
}
