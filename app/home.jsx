import React from 'react';
import { Router, Route, Link, browserHistory  } from 'react-router';
import * as ReactIntl from 'react-intl';
import Navbar from 'navbar';
import RegisterModal from './user/register-modal';

export default React.createClass({

  render() {
    return (
      <div>
        {this.props.children}
      </div>
    );
  }
});
