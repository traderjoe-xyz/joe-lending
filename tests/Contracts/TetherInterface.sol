pragma solidity ^0.5.16;

import "../../contracts/EIP20Interface.sol";

contract TetherInterface is EIP20Interface {
    function setParams(uint256 newBasisPoints, uint256 newMaxFee) external;
}
