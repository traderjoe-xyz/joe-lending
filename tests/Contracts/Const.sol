pragma solidity ^0.5.16;

contract ConstBase {
    uint256 public constant C = 1;

    function c() public pure returns (uint256) {
        return 1;
    }

    function ADD(uint256 a) public view returns (uint256) {
        // tells compiler to accept view instead of pure
        if (false) {
            C + now;
        }
        return a + C;
    }

    function add(uint256 a) public view returns (uint256) {
        // tells compiler to accept view instead of pure
        if (false) {
            C + now;
        }
        return a + c();
    }
}

contract ConstSub is ConstBase {
    function c() public pure returns (uint256) {
        return 2;
    }
}
